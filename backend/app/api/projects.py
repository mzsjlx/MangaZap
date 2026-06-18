from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from pathlib import Path
import logging

from ..services.project_store import project_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _determine_status(phase: str, sub_phase: str, state: dict = None) -> str:
    if state is None:
        state = {}

    status_map = {
        "idle": "draft",
        "wizard": "draft",
        "generating_script": "draft",
        "script_review": "scripted",
        "generating_key_elements": "scripted",
        "key_elements_review": "scripted",
        "generating_narration": "scripted",
        "narration_review": "scripted",
        "generating_dialogue": "scripted",
        "dialogue_review": "scripted",
        "generating_storyboard": "storyboarded",
        "storyboard_review": "storyboarded",
        "confirming_image": "storyboarded",
        "voice_selection": "storyboarded",
        "done": "completed",
    }

    base_status = status_map.get(phase, "draft")

    if phase == "done":
        has_content = any([
            state.get("scriptContent", ""),
            state.get("storyboardContent", ""),
            state.get("keyElementsContent", ""),
        ])
        if not has_content:
            return "draft"

    return base_status


class ConversationState(BaseModel):
    phase: str = "idle"
    currentSubPhase: str = "none"
    scriptContent: str = ""
    storyboardContent: str = ""
    keyElementsContent: str = ""
    narrationContent: str = ""
    dialogueContent: str = ""
    optimizedPrompts: str = ""
    keyElementsImages: Dict[str, Any] = {}
    shotImages: Dict[str, Any] = {}
    keyFramesImages: Dict[str, Any] = {}
    keyFrameVideos: Dict[str, str] = {}
    selectedReferenceImages: Dict[str, str] = {}
    awaitingReferenceSelection: bool = False
    voiceTracks: Dict[str, Any] = {}
    session: Dict[str, Optional[str]] = {}
    messages: List[Dict[str, Any]] = []
    questions: List[Dict[str, Any]] = []
    currentQuestionIndex: int = 0


class ProjectSaveRequest(BaseModel):
    title: Optional[str] = None
    idea: Optional[str] = None
    style: Optional[str] = None
    duration: Optional[int] = None
    status: Optional[str] = None
    conversation_state: Optional[ConversationState] = None
    expected_updated_at: Optional[str] = None


@router.get("")
async def list_projects():
    projects = project_store.list_all()
    return {"projects": projects}


@router.post("")
async def create_project(data: dict):
    idea = data.get("idea", "")
    style = data.get("style", "manga")
    duration = data.get("duration", 90)
    project = project_store.create(idea, style, duration)
    return project


@router.get("/{project_id}")
async def get_project(project_id: str):
    project = project_store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}")
async def update_project(project_id: str, data: ProjectSaveRequest):
    try:
        updates = data.dict(exclude_none=True)
        project_store.update(
            project_id,
            updates,
            expected_updated_at=data.expected_updated_at
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
    except ValueError as e:
        if "CONFLICT" in str(e):
            raise HTTPException(status_code=409, detail="项目已被其他人修改，请刷新后重试")
        raise

    return {"status": "ok", "project_id": project_id}


@router.post("/{project_id}/save")
async def save_project_state(project_id: str, state: ConversationState):
    try:
        project_store.update(project_id, {
            "conversation_state": state.dict()
        })
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
    except ValueError as e:
        if "CONFLICT" in str(e):
            raise HTTPException(status_code=409, detail="项目已被其他人修改，请刷新后重试")
        raise

    return {"status": "ok", "project_id": project_id}


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    success = project_store.delete(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "ok"}


@router.get("/{project_id}/video")
async def get_project_video(project_id: str):
    project = project_store.get(project_id)
    if not project or not project.get("video_path"):
        raise HTTPException(status_code=404, detail="Video not found")

    video_path = Path(project["video_path"])
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")

    return FileResponse(video_path, media_type="video/mp4")


@router.get("/images/{project_id}/{filename}")
async def get_project_image(project_id: str, filename: str):
    img_path = project_store.images_dir / project_id / filename
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(img_path, media_type="image/png")


@router.post("/{project_id}/download-images")
async def download_project_images(project_id: str):
    try:
        results = await project_store.download_all_images(project_id)
        return {
            "status": "ok",
            "keyElementsImages": results["keyElementsImages"],
            "shotImages": results["shotImages"]
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
    except Exception as e:
        logger.error(f"Failed to download images: {e}")
        raise HTTPException(status_code=500, detail=str(e))
