import logging
from typing import AsyncGenerator

logger = logging.getLogger(__name__)


async def generate_storyboard_stream(
    script: dict,
) -> AsyncGenerator[dict, None]:
    yield {"step": "storyboard", "message": "Building storyboard from script...", "progress": 32}

    scenes = script.get("scenes", [])

    yield {"step": "storyboard", "message": f"Processing {len(scenes)} scenes...", "progress": 35}

    for i, scene in enumerate(scenes):
        progress = 35 + int(25 * (i + 1) / len(scenes))
        yield {
            "step": "storyboard",
            "message": f"Scene {i + 1}/{len(scenes)}: {scene.get('title', 'Untitled')}",
            "progress": progress,
        }

    storyboard = _build_storyboard(script)

    yield {
        "step": "storyboard",
        "message": f"Storyboard complete: {len(storyboard['panels'])} panels",
        "progress": 60,
        "data": storyboard,
    }


def _build_storyboard(script: dict) -> dict:
    panels = []
    for scene in script.get("scenes", []):
        panels.append({
            "scene_id": scene.get("id", len(panels) + 1),
            "title": scene.get("title", f"Scene {len(panels) + 1}"),
            "description": scene.get("description", ""),
            "prompt": scene.get("prompt", ""),
            "narration": scene.get("narration", ""),
            "duration": scene.get("duration", 5),
            "composition": "medium_shot",
            "camera_movement": "static",
            "transition": "cut",
        })

    return {
        "title": script.get("title", "Untitled"),
        "style": script.get("style", "anime"),
        "panels": panels,
    }
