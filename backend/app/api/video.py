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

MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds
CREATE_TIMEOUT = 60  # seconds
POLL_TIMEOUT = 15  # seconds


class VideoGenerateRequest(BaseModel):
    image_url: str
    prompt: str
    api_key: str
    base_url: str = VIDEO_BASE_URL
    model: str = VIDEO_MODEL
    num_frames: int = 121
    frame_rate: int = 24


class VideoTaskResponse(BaseModel):
    task_id: str
    id_type: str  # "video_id" or "task_id"
    status: str = "pending"


class VideoStatusResponse(BaseModel):
    status: str  # "pending", "completed", "failed"
    video_url: str | None = None
    error: str | None = None


@router.post("/api/video/generate", response_model=VideoTaskResponse)
async def create_video_task(request: VideoGenerateRequest):
    """创建视频生成任务，带重试机制"""
    print(f"[video] CREATE TASK, model: {request.model}")
    print(f"[video] image_url: {request.image_url[:120] if request.image_url else 'EMPTY'}")
    print(f"[video] base_url: {request.base_url}")
    print(f"[video] api_key: {'SET (' + str(len(request.api_key)) + ' chars)' if request.api_key else 'EMPTY'}")

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
    print(f"[video] create_url: {create_url}")

    payload = {
        "model": request.model,
        "prompt": request.prompt,
        "image": request.image_url,
        "num_frames": request.num_frames,
        "frame_rate": request.frame_rate,
    }
    print(f"[video] Request payload: {json.dumps(payload, ensure_ascii=False)[:300]}")

    # 带重试的创建任务
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(CREATE_TIMEOUT)) as client:
                resp = await client.post(
                    create_url,
                    headers={
                        "Authorization": f"Bearer {request.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                print(f"[video] Response status: {resp.status_code} (attempt {attempt + 1}/{MAX_RETRIES})")
                resp.raise_for_status()
                resp_data = resp.json()
                print(f"[video] Agnes create response: {json.dumps(resp_data, ensure_ascii=False)[:300]}")

                video_id = resp_data.get("video_id")
                task_id = resp_data.get("task_id")
                if not video_id and not task_id:
                    raise HTTPException(502, f"No video_id or task_id in response: {resp_data}")

                query_id = video_id or task_id
                id_type = "video_id" if video_id else "task_id"
                print(f"[video] Task created: {id_type}={query_id}")

                return VideoTaskResponse(task_id=query_id, id_type=id_type, status="pending")

        except httpx.ReadTimeout:
            last_error = "Agnes API read timeout - service may be busy"
            print(f"[video] ReadTimeout on attempt {attempt + 1}/{MAX_RETRIES}")
            logger.warning(f"[video.create] ReadTimeout on attempt {attempt + 1}/{MAX_RETRIES}")
            if attempt < MAX_RETRIES - 1:
                print(f"[video] Retrying in {RETRY_DELAY}s...")
                await asyncio.sleep(RETRY_DELAY)

        except httpx.ConnectError:
            last_error = "Cannot connect to Agnes API - check network"
            print(f"[video] ConnectError on attempt {attempt + 1}/{MAX_RETRIES}")
            logger.warning(f"[video.create] ConnectError on attempt {attempt + 1}/{MAX_RETRIES}")
            if attempt < MAX_RETRIES - 1:
                print(f"[video] Retrying in {RETRY_DELAY}s...")
                await asyncio.sleep(RETRY_DELAY)

        except httpx.HTTPStatusError as e:
            error_text = e.response.text[:500]
            print(f"[video] Agnes API HTTP error: {e.response.status_code} - {error_text}")
            logger.error(f"[video.create] Agnes API error: {e.response.status_code} - {error_text}")
            raise HTTPException(502, f"Agnes API error: {e.response.status_code} - {error_text}")

        except HTTPException:
            raise

        except Exception as e:
            last_error = f"{type(e).__name__}: {str(e) or repr(e)}"
            print(f"[video] Unexpected error on attempt {attempt + 1}: {last_error}")
            traceback.print_exc()
            logger.error(f"[video.create] Unexpected error: {last_error}")
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAY)

    # 所有重试都失败
    print(f"[video] All {MAX_RETRIES} attempts failed. Last error: {last_error}")
    raise HTTPException(502, f"Agnes API unavailable after {MAX_RETRIES} retries: {last_error}")


@router.get("/api/video/status/{task_id}", response_model=VideoStatusResponse)
async def get_video_status(task_id: str, api_key: str, base_url: str = VIDEO_BASE_URL, id_type: str = "video_id"):
    """查询视频生成任务状态"""
    base = base_url.rstrip('/')

    if id_type == "video_id":
        poll_url = f"{base}/agnesapi?video_id={task_id}"
    else:
        poll_url = f"{base}/v1/videos/{task_id}"

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(POLL_TIMEOUT)) as client:
            result = await client.get(
                poll_url,
                headers={"Authorization": f"Bearer {api_key}"},
            )
            result.raise_for_status()
            data = result.json()

            status = data.get("status", "unknown")
            print(f"[video] Task {task_id} status: {status}")

            # 完成
            if status in ["completed", "done", "success", "finished"]:
                video_url = data.get("remixed_from_video_id")
                if not video_url:
                    print(f"[video] Completed but no URL, response: {data}")
                    return VideoStatusResponse(status="failed", error="Video completed but no URL returned")
                print(f"[video] SUCCESS, video_url: {video_url[:100]}...")
                return VideoStatusResponse(status="completed", video_url=video_url)

            # 失败
            elif status in ["failed", "error", "cancelled"]:
                error = data.get("error") or data.get("message") or "Unknown error"
                print(f"[video] Task failed: {error}")
                return VideoStatusResponse(status="failed", error=str(error))

            # 还在处理中
            else:
                return VideoStatusResponse(status="pending")

    except httpx.ReadTimeout:
        print(f"[video] Poll ReadTimeout for {task_id}")
        return VideoStatusResponse(status="pending")
    except httpx.HTTPStatusError as e:
        print(f"[video] Poll HTTP error: {e.response.status_code}")
        return VideoStatusResponse(status="pending")
    except Exception as e:
        print(f"[video] Poll exception: {type(e).__name__}: {e}")
        return VideoStatusResponse(status="pending")
