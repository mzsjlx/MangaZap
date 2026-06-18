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
RETRY_DELAY = 5
CREATE_TIMEOUT = 60
POLL_TIMEOUT = 15


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
    video_id: str | None = None
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

    if not request.api_key:
        raise HTTPException(400, "API key is empty")
    if not request.image_url:
        raise HTTPException(400, "image_url is empty")
    if not request.base_url:
        raise HTTPException(400, "base_url is empty")
    if not request.image_url.startswith("http"):
        raise HTTPException(400, f"image_url must be HTTP(S) URL")

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
                print(f"[video] Agnes response: {json.dumps(resp_data, ensure_ascii=False)[:500]}")

                video_id = resp_data.get("video_id")
                task_id = resp_data.get("task_id")
                if not video_id and not task_id:
                    raise HTTPException(502, f"No video_id or task_id in response: {resp_data}")

                print(f"[video] Task created: task_id={task_id}, video_id={video_id[:50] if video_id else 'None'}...")
                return VideoTaskResponse(
                    task_id=task_id or video_id,
                    video_id=video_id,
                    status="pending"
                )

        except httpx.ReadTimeout:
            last_error = "Agnes API read timeout - service may be busy"
            print(f"[video] ReadTimeout on attempt {attempt + 1}/{MAX_RETRIES}")
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAY)

        except httpx.ConnectError:
            last_error = "Cannot connect to Agnes API - check network"
            print(f"[video] ConnectError on attempt {attempt + 1}/{MAX_RETRIES}")
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAY)

        except httpx.HTTPStatusError as e:
            error_text = e.response.text[:500]
            print(f"[video] Agnes API HTTP error: {e.response.status_code} - {error_text}")
            raise HTTPException(502, f"Agnes API error: {e.response.status_code} - {error_text}")

        except HTTPException:
            raise

        except Exception as e:
            last_error = f"{type(e).__name__}: {str(e) or repr(e)}"
            print(f"[video] Unexpected error on attempt {attempt + 1}: {last_error}")
            traceback.print_exc()
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAY)

    print(f"[video] All {MAX_RETRIES} attempts failed. Last error: {last_error}")
    raise HTTPException(502, f"Agnes API unavailable after {MAX_RETRIES} retries: {last_error}")


@router.get("/api/video/status/{task_id}", response_model=VideoStatusResponse)
async def get_video_status(
    task_id: str,
    api_key: str,
    base_url: str = VIDEO_BASE_URL,
    video_id: str | None = None,
):
    """
    查询视频生成任务状态
    
    Agnes AI 官方文档:
    - 推荐方式: GET {base_url}/agnesapi?video_id={video_id}
    - 兼容方式: GET {base_url}/v1/videos/{task_id}
    - 状态值: queued -> in_progress -> completed/failed
    - 视频URL字段: remixed_from_video_id
    """
    base = base_url.rstrip('/')
    # Agnes 轮询 URL 不带 /v1，创建任务 URL 带 /v1
    # 创建: {base}/videos = https://apihub.agnes-ai.com/v1/videos
    # 轮询: https://apihub.agnes-ai.com/agnesapi?video_id=xxx (无 /v1)
    base_no_v1 = base.rstrip('/').replace('/v1', '').rstrip('/')

    # 优先使用 video_id 查询（推荐方式）
    if video_id:
        poll_url = f"{base_no_v1}/agnesapi?video_id={video_id}"
    else:
        poll_url = f"{base_no_v1}/v1/videos/{task_id}"

    print(f"[video] POLL {poll_url}")

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(POLL_TIMEOUT)) as client:
            result = await client.get(
                poll_url,
                headers={"Authorization": f"Bearer {api_key}"},
            )
            result.raise_for_status()
            data = result.json()

            # 打印完整响应用于诊断
            print(f"[video] === FULL RESPONSE ===")
            print(f"[video] {json.dumps(data, ensure_ascii=False, default=str)}")
            print(f"[video] === ALL KEYS: {list(data.keys())} ===")

            status = data.get("status", "unknown")
            print(f"[video] Status: {status}")

            # 检查隐藏错误字段
            error_field = data.get("error")
            message_field = data.get("message")
            detail_field = data.get("detail")
            progress_field = data.get("progress")
            created_at = data.get("created_at")

            if error_field: print(f"[video] ERROR FIELD: {error_field}")
            if message_field: print(f"[video] MESSAGE FIELD: {message_field}")
            if detail_field: print(f"[video] DETAIL FIELD: {detail_field}")
            if progress_field is not None: print(f"[video] PROGRESS: {progress_field}")
            if created_at: print(f"[video] CREATED_AT: {created_at}")

            # 完成
            if status == "completed":
                video_url = data.get("remixed_from_video_id")
                if not video_url:
                    print(f"[video] Completed but no URL!")
                    return VideoStatusResponse(status="failed", error="Video completed but no URL returned")
                print(f"[video] SUCCESS, video_url: {video_url[:100]}...")
                return VideoStatusResponse(status="completed", video_url=video_url)

            # 失败
            elif status == "failed":
                error = data.get("error") or data.get("message") or "Unknown error"
                print(f"[video] Task failed: {error}")
                return VideoStatusResponse(status="failed", error=str(error))

            # 还在处理中 (queued, in_progress)
            else:
                return VideoStatusResponse(status="pending")

    except httpx.ReadTimeout:
        print(f"[video] Poll ReadTimeout")
        return VideoStatusResponse(status="pending")
    except httpx.HTTPStatusError as e:
        print(f"[video] Poll HTTP error: {e.response.status_code}")
        return VideoStatusResponse(status="pending")
    except Exception as e:
        print(f"[video] Poll exception: {type(e).__name__}: {e}")
        return VideoStatusResponse(status="pending")
