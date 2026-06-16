import httpx
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
    """创建视频生成任务，返回 task_id 供前端轮询"""
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

    try:
        async with httpx.AsyncClient() as client:
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

            video_id = resp_data.get("video_id")
            task_id = resp_data.get("task_id")
            if not video_id and not task_id:
                raise HTTPException(502, f"No video_id or task_id in response: {resp_data}")

            query_id = video_id or task_id
            id_type = "video_id" if video_id else "task_id"
            print(f"[video] Task created: {id_type}={query_id}")

            return VideoTaskResponse(task_id=query_id, id_type=id_type, status="pending")

    except httpx.HTTPStatusError as e:
        error_text = e.response.text[:500]
        print(f"[video] Agnes API error: {e.response.status_code} - {error_text}")
        logger.error(f"[video.create] Agnes API error: {e.response.status_code} - {error_text}")
        raise HTTPException(502, f"Agnes API error: {e.response.status_code} - {error_text}")
    except httpx.RequestError as e:
        print(f"[video] Network error: {type(e).__name__}: {repr(e)}")
        logger.error(f"[video.create] Network error: {type(e).__name__}: {repr(e)}")
        raise HTTPException(502, f"Network error connecting to {create_url}: {type(e).__name__}: {str(e) or repr(e)}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[video] Unexpected error: {type(e).__name__}: {repr(e)}")
        traceback.print_exc()
        logger.error(f"[video.create] Unexpected error: {type(e).__name__}: {repr(e)}")
        raise HTTPException(500, f"Failed to create video task: {type(e).__name__}: {str(e) or repr(e)}")


@router.get("/api/video/status/{task_id}", response_model=VideoStatusResponse)
async def get_video_status(task_id: str, api_key: str, base_url: str = VIDEO_BASE_URL, id_type: str = "video_id"):
    """查询视频生成任务状态"""
    base = base_url.rstrip('/')

    if id_type == "video_id":
        poll_url = f"{base}/agnesapi?video_id={task_id}"
    else:
        poll_url = f"{base}/v1/videos/{task_id}"

    print(f"[video] POLL status for {id_type}={task_id}")

    try:
        async with httpx.AsyncClient() as client:
            result = await client.get(
                poll_url,
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10,
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

    except httpx.HTTPStatusError as e:
        print(f"[video] Poll HTTP error: {e.response.status_code}")
        return VideoStatusResponse(status="pending")
    except Exception as e:
        print(f"[video] Poll exception: {type(e).__name__}: {e}")
        return VideoStatusResponse(status="pending")
