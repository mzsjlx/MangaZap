import json
import uuid
import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..services.project_store import project_store
from ..services.script_generator import generate_script_stream
from ..services.storyboard import generate_storyboard_stream
from ..services.image_generator import generate_images_stream
from ..services.tts import generate_tts_stream
from ..services.video_composer import compose_video_stream
from ..core.task_manager import task_manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/generate")
async def generate_video(data: dict):
    idea = data.get("idea", "").strip()
    if not idea:
        raise HTTPException(status_code=400, detail="'idea' is required")

    style = data.get("style", "anime")
    duration = int(data.get("duration", 30))
    api_keys = data.get("api_keys", {})
    auto_confirm = data.get("auto_confirm", False)

    project = project_store.create(idea, style, duration)
    project_id = project["id"]

    async def event_stream():
        try:
            yield _sse({"step": "init", "message": f"Project {project_id} created", "progress": 2, "project_id": project_id})

            script = None
            async for event in generate_script_stream(idea, style, duration, api_keys=api_keys):
                if event.get("data") and event["step"] == "script":
                    script = event["data"]
                yield _sse(event)

            if not script:
                yield _sse({"step": "error", "message": "Script generation failed", "progress": 0})
                return

            project_store.update(project_id, {"script": script, "status": "scripted"})

            storyboard = None
            async for event in generate_storyboard_stream(script):
                if event.get("data") and event["step"] == "storyboard":
                    storyboard = event["data"]
                yield _sse(event)

            if not storyboard:
                yield _sse({"step": "error", "message": "Storyboard generation failed", "progress": 0})
                return

            project_store.update(project_id, {
                "scenes": storyboard["panels"],
                "status": "storyboarded",
            })

            audio_paths = []
            async for event in generate_tts_stream(storyboard["panels"], project_id):
                if event.get("data") and event["step"] == "tts":
                    audio_paths = event["data"].get("audio_paths", [])
                yield _sse(event)

            if not auto_confirm:
                task_id = uuid.uuid4().hex[:12]
                task_manager.save_task(task_id, project_id, "image", {
                    "idea": idea,
                    "style": style,
                    "duration": duration,
                    "api_keys": api_keys,
                    "script": script,
                    "storyboard": storyboard,
                    "audio_paths": audio_paths,
                })
                yield _sse({
                    "step": "need_confirm",
                    "step_name": "生成图片",
                    "step_id": "image",
                    "task_id": task_id,
                    "message": "已完成剧本、分镜和语音生成，确认后开始生成图片",
                    "progress": 55,
                })
                return

            async for sse in _run_image_and_video(project_id, storyboard, audio_paths, api_keys):
                yield sse

        except Exception as e:
            logger.exception("Generation failed")
            project_store.update(project_id, {"status": "failed", "error": str(e)})
            yield _sse({"step": "error", "message": str(e), "progress": 0})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/api/generate/confirm")
async def confirm_generation(data: dict):
    task_id = data.get("task_id", "").strip()
    step_id = data.get("step_id", "").strip()

    if not task_id:
        raise HTTPException(status_code=400, detail="'task_id' is required")

    task = task_manager.load_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task_manager.delete_task(task_id)

    ctx = task["context"]
    project_id = task["project_id"]

    async def resume_stream():
        try:
            yield _sse({"step": "init", "message": f"Resuming task {task_id}", "progress": 55, "project_id": project_id})

            async for sse in _run_image_and_video(
                project_id,
                ctx["storyboard"],
                ctx["audio_paths"],
                ctx.get("api_keys", {}),
            ):
                yield sse

        except Exception as e:
            logger.exception("Resume generation failed")
            project_store.update(project_id, {"status": "failed", "error": str(e)})
            yield _sse({"step": "error", "message": str(e), "progress": 0})

    return StreamingResponse(
        resume_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _run_image_and_video(
    project_id: str,
    storyboard: dict,
    audio_paths: list,
    api_keys: dict,
):
    image_paths = []
    async for event in generate_images_stream(storyboard, project_id, api_keys=api_keys):
        if event.get("data") and event["step"] == "image":
            image_paths = event["data"].get("image_paths", [])
        yield _sse(event)

    min_len = min(len(image_paths), len(audio_paths))
    image_paths = image_paths[:min_len]
    audio_paths = audio_paths[:min_len]
    scenes_for_video = storyboard["panels"][:min_len]

    video_path = None
    async for event in compose_video_stream(project_id, image_paths, audio_paths, scenes_for_video):
        if event.get("data", {}).get("video_path"):
            video_path = event["data"]["video_path"]
        yield _sse(event)

    project_store.update(project_id, {"status": "completed", "video_path": video_path})
    yield _sse({
        "step": "done",
        "message": "Video generation complete!",
        "progress": 100,
        "project_id": project_id,
        "video_url": f"/api/projects/{project_id}/video",
    })


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
