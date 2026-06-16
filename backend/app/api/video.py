import httpx
import asyncio
import json
import logging
import traceback
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.defaults import VIDEO_BASE_URL, VIDEO_MODEL

logger = logging.getLogger(__name__)
router = APIRouter()


class VideoGenerateRequest(BaseModel):
    image_url: str
    prompt: str
    api_key: str
    base_url: str = VIDEO_BASE_URL
    model: str = VIDEO_MODEL
    num_frames: int = 121
    frame_rate: int = 24


class VideoGenerateResponse(BaseModel):
    video_url: str


@router.post("/api/video/generate", response_model=VideoGenerateResponse)
async def generate_video(request: VideoGenerateRequest):
    """调用 Agnes AI 图生视频 API"""
    print(f"[video] START, model: {request.model}")
    print(f"[video] image_url: {request.image_url[:120] if request.image_url else 'EMPTY'}")
    print(f"[video] base_url: {request.base_url}")
    print(f"[video] api_key: {'SET (' + str(len(request.api_key)) + ' chars)' if request.api_key else 'EMPTY'}")
    print(f"[video] prompt length: {len(request.prompt)}")
    logger.info(f"[video.generate] START, model={request.model}, base_url={request.base_url}, api_key_len={len(request.api_key)}, image_url={request.image_url[:80]}...")

    # Validate inputs
    if not request.api_key:
        raise HTTPException(400, "API key is empty - please configure a video API key in settings")
    if not request.image_url:
        raise HTTPException(400, "image_url is empty - no keyframe image available")
    if not request.base_url:
        raise HTTPException(400, "base_url is empty - please configure a video API base URL in settings")
    if not request.image_url.startswith("http"):
        raise HTTPException(400, f"image_url must be an HTTP(S) URL, got: {request.image_url[:50]}")

    base = request.base_url.rstrip('/')
    create_url = f"{base}/videos"
    poll_url = f"{base}/agnesapi"

    print(f"[video] create_url: {create_url}")
    print(f"[video] poll_url: {poll_url}")

    async with httpx.AsyncClient() as client:
        # 1. 创建任务
        try:
            payload = {
                "model": request.model,
                "prompt": request.prompt,
                "image": request.image_url,
                "num_frames": request.num_frames,
                "frame_rate": request.frame_rate,
            }
            print(f"[video] Request payload: {json.dumps(payload, ensure_ascii=False)[:300]}")

            resp = await client.post(
                create_url,
                headers={
                    "Authorization": f"Bearer {request.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=30,
            )
            print(f"[video] Response status: {resp.status_code}")
            resp.raise_for_status()
            resp_data = resp.json()
            print(f"[video] Agnes create response: {json.dumps(resp_data, ensure_ascii=False)[:300]}")
            logger.info(f"[video.generate] Agnes create response: {resp_data}")

            video_id = resp_data.get("video_id")
            task_id = resp_data.get("task_id")
            if not video_id and not task_id:
                raise HTTPException(502, f"No video_id or task_id in response: {resp_data}")

            query_id = video_id or task_id
            id_type = "video_id" if video_id else "task_id"
            print(f"[video] Task created: {id_type}={query_id}")
            logger.info(f"[video.generate] Task created: {id_type}={query_id}")

        except httpx.HTTPStatusError as e:
            error_text = e.response.text[:500]
            print(f"[video] Agnes API error: {e.response.status_code} - {error_text}")
            logger.error(f"[video.generate] Agnes API error: {e.response.status_code} - {error_text}")
            raise HTTPException(502, f"Agnes API error: {e.response.status_code} - {error_text}")
        except httpx.RequestError as e:
            print(f"[video] Network error: {type(e).__name__}: {repr(e)}")
            logger.error(f"[video.generate] Network error: {type(e).__name__}: {repr(e)}")
            raise HTTPException(502, f"Network error connecting to {create_url}: {type(e).__name__}: {str(e) or repr(e)}")
        except HTTPException:
            raise
        except Exception as e:
            print(f"[video] Unexpected error: {type(e).__name__}: {repr(e)}")
            traceback.print_exc()
            logger.error(f"[video.generate] Unexpected error: {type(e).__name__}: {repr(e)}")
            raise HTTPException(500, f"Failed to create video task: {type(e).__name__}: {str(e) or repr(e)}")

        # 2. 轮询结果（最多 5 分钟）
        for attempt in range(60):
            await asyncio.sleep(5)

            try:
                if video_id:
                    result_url = f"{poll_url}?video_id={video_id}"
                else:
                    result_url = f"{base}/v1/videos/{task_id}"

                result = await client.get(
                    result_url,
                    headers={"Authorization": f"Bearer {request.api_key}"},
                    timeout=10,
                )
                result.raise_for_status()
                data = result.json()

                print(f"[video] Attempt {attempt + 1}/60, response: {json.dumps(data, ensure_ascii=False, default=str)[:500]}")
                logger.info(f"[video.generate] Attempt {attempt + 1}/60, full response: {json.dumps(data, ensure_ascii=False, default=str)[:1000]}")

                status = data.get("status", "unknown")
                print(f"[video] Task {query_id} status: {status} (attempt {attempt + 1}/60)")

                if status in ["completed", "done", "success", "finished"]:
                    video_url = data.get("remixed_from_video_id")
                    if not video_url:
                        print(f"[video] Completed but no URL, full response: {data}")
                        raise HTTPException(500, "Video completed but no URL returned")
                    print(f"[video] SUCCESS, video_url: {video_url[:100]}...")
                    logger.info(f"[video.generate] Success, video_url: {video_url}")
                    return VideoGenerateResponse(video_url=video_url)

                elif status in ["failed", "error", "cancelled"]:
                    error = data.get("error") or data.get("message") or "Unknown error"
                    print(f"[video] Task failed: {error}, full response: {data}")
                    logger.error(f"[video.generate] Task failed: {error}, full response: {data}")
                    raise HTTPException(500, f"Video generation failed: {error}")

                else:
                    if attempt % 6 == 0:
                        print(f"[video] Still processing... status={status}")
                        logger.info(f"[video.generate] Still processing, status={status}")

            except httpx.HTTPStatusError as e:
                print(f"[video] Poll error: {e.response.status_code}")
                logger.warning(f"[video.generate] Poll error: {e.response.status_code}")
                continue
            except Exception as e:
                print(f"[video] Poll exception: {type(e).__name__}: {e}")
                logger.warning(f"[video.generate] Poll exception: {type(e).__name__}: {e}")
                continue

        raise HTTPException(504, "Video generation timeout (5 minutes)")
