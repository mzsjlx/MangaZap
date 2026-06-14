import httpx
import asyncio
import json
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


class VideoGenerateRequest(BaseModel):
    image_url: str
    prompt: str
    api_key: str
    base_url: str = "https://apihub.agnes-ai.com/v1"
    model: str = "agnes-video-v2.0"
    num_frames: int = 121
    frame_rate: int = 24


class VideoGenerateResponse(BaseModel):
    video_url: str


@router.post("/api/video/generate", response_model=VideoGenerateResponse)
async def generate_video(request: VideoGenerateRequest):
    """调用 Agnes AI 图生视频 API"""
    print(f"[video] START, prompt length: {len(request.prompt)}, model: {request.model}")
    logger.info(f"[video.generate] START, model={request.model}, image_url={request.image_url[:50]}...")

    full_url = f"{request.base_url.rstrip('/')}/video/generations"

    async with httpx.AsyncClient() as client:
        # 1. 创建任务
        try:
            resp = await client.post(
                full_url,
                headers={
                    "Authorization": f"Bearer {request.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": request.model,
                    "prompt": request.prompt,
                    "image": request.image_url,
                    "height": 768,
                    "width": 1152,
                    "num_frames": request.num_frames,
                    "frame_rate": request.frame_rate,
                },
                timeout=30,
            )
            resp.raise_for_status()
            resp_data = resp.json()
            print(f"[video] Agnes create response: {resp_data}")
            logger.info(f"[video.generate] Agnes create response: {resp_data}")
            
            task_id = resp_data.get("task_id")
            if not task_id:
                raise HTTPException(502, f"No task_id in response: {resp_data}")
            
            print(f"[video] Task created: {task_id}")
            logger.info(f"[video.generate] Task created: {task_id}")

        except httpx.HTTPStatusError as e:
            error_text = e.response.text[:500]
            print(f"[video] Agnes API error: {e.response.status_code} - {error_text}")
            logger.error(f"[video.generate] Agnes API error: {e.response.status_code} - {error_text}")
            raise HTTPException(502, f"Agnes API error: {e.response.status_code} - {error_text}")
        except Exception as e:
            print(f"[video] Failed to create task: {e}")
            logger.error(f"[video.generate] Failed to create task: {e}")
            raise HTTPException(500, f"Failed to create video task: {str(e)}")

        # 2. 轮询结果（最多 5 分钟）
        for attempt in range(60):
            await asyncio.sleep(5)

            try:
                result = await client.get(
                    f"{full_url}/{task_id}",
                    headers={"Authorization": f"Bearer {request.api_key}"},
                    timeout=10,
                )
                result.raise_for_status()
                data = result.json()

                # 打印完整响应，确认实际字段名
                print(f"[video] Attempt {attempt + 1}/60, response: {json.dumps(data, ensure_ascii=False, default=str)[:500]}")
                logger.info(f"[video.generate] Attempt {attempt + 1}/60, full response: {json.dumps(data, ensure_ascii=False, default=str)[:1000]}")

                # 尝试多个可能的状态字段
                status = (
                    data.get("status")
                    or data.get("state")
                    or data.get("task_status")
                    or data.get("progress")
                    or "unknown"
                )
                print(f"[video] Task {task_id} status: {status} (attempt {attempt + 1}/60)")

                # 完成状态
                if status in ["completed", "done", "success", "finished"]:
                    video_url = (
                        data.get("video_url")
                        or data.get("remixed_from_video_id")
                        or data.get("output_url")
                        or data.get("result", {}).get("video_url") if isinstance(data.get("result"), dict) else None
                    )
                    if not video_url:
                        print(f"[video] Completed but no URL, full response: {data}")
                        raise HTTPException(500, "Video completed but no URL returned")
                    print(f"[video] SUCCESS, video_url: {video_url[:100]}...")
                    logger.info(f"[video.generate] Success, video_url: {video_url}")
                    return VideoGenerateResponse(video_url=video_url)

                # 失败状态
                elif status in ["failed", "error", "cancelled"]:
                    error = data.get("error") or data.get("message") or "Unknown error"
                    print(f"[video] Task failed: {error}, full response: {data}")
                    logger.error(f"[video.generate] Task failed: {error}, full response: {data}")
                    raise HTTPException(500, f"Video generation failed: {error}")

                # 其他状态（None, pending, processing, queued 等）继续轮询
                else:
                    if attempt % 6 == 0:  # 每30秒打印一次详细日志
                        print(f"[video] Still processing... status={status}")
                        logger.info(f"[video.generate] Still processing, status={status}")

            except httpx.HTTPStatusError as e:
                print(f"[video] Poll error: {e.response.status_code}")
                logger.warning(f"[video.generate] Poll error: {e.response.status_code}")
                continue
            except Exception as e:
                print(f"[video] Poll exception: {e}")
                logger.warning(f"[video.generate] Poll exception: {e}")
                continue

        raise HTTPException(504, "Video generation timeout (5 minutes)")
