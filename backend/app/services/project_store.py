import json
import uuid
import httpx
import logging
import os
import shutil
from pathlib import Path
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

PROJECTS_DIR = os.getenv("MANGAZAP_PROJECTS_DIR", "D:/mangazap_data/projects")
IMAGES_DIR = os.getenv("MANGAZAP_IMAGES_DIR", "D:/mangazap_data/images")


class ProjectStore:
    def __init__(self):
        self.data_dir = Path(PROJECTS_DIR)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.images_dir = Path(IMAGES_DIR)
        self.images_dir.mkdir(parents=True, exist_ok=True)

    def _project_path(self, project_id: str) -> Path:
        return self.data_dir / f"{project_id}.json"

    def _images_dir(self, project_id: str) -> Path:
        img_dir = self.images_dir / project_id
        img_dir.mkdir(parents=True, exist_ok=True)
        return img_dir

    def create(self, idea: str, style: str, duration: int) -> dict:
        project_id = uuid.uuid4().hex[:12]
        now = self._now()
        project = {
            "id": project_id,
            "title": idea[:50] if idea else "未命名项目",
            "idea": idea,
            "style": style,
            "duration": duration,
            "status": "draft",
            "script": None,
            "scenes": [],
            "created_at": now,
            "updated_at": now,
            "video_path": None,
            "error": None,
            "conversation_state": {
                "phase": "idle",
                "currentSubPhase": "none",
                "scriptContent": "",
                "storyboardContent": "",
                "keyElementsContent": "",
                "narrationContent": "",
                "dialogueContent": "",
                "optimizedPrompts": "",
                "keyElementsImages": {},
                "shotImages": {},
                "session": {},
                "messages": [],
                "questions": [],
                "currentQuestionIndex": 0,
            }
        }
        self._save(project)
        return project

    def get(self, project_id: str) -> dict | None:
        path = self._project_path(project_id)
        if not path.exists():
            return None
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def update(self, project_id: str, updates: dict, expected_updated_at: str = None) -> dict:
        project = self.get(project_id)
        if not project:
            raise FileNotFoundError(f"Project {project_id} not found")

        if expected_updated_at and project.get("updated_at") != expected_updated_at:
            raise ValueError("CONFLICT")

        project.update(updates)
        project["updated_at"] = self._now()
        self._save(project)
        return project

    def list_all(self) -> list[dict]:
        projects = []
        for path in self.data_dir.glob("*.json"):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    projects.append(json.load(f))
            except Exception:
                continue
        projects.sort(key=lambda p: p.get("created_at", ""), reverse=True)
        return projects

    def delete(self, project_id: str) -> bool:
        path = self._project_path(project_id)
        if path.exists():
            path.unlink()
            img_dir = self.images_dir / project_id
            if img_dir.exists():
                shutil.rmtree(img_dir)
            return True
        return False

    async def download_image(self, project_id: str, url: str, filename: str) -> str:
        try:
            img_dir = self._images_dir(project_id)
            local_path = img_dir / filename

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url)
                response.raise_for_status()

                with open(local_path, "wb") as f:
                    f.write(response.content)

            return f"/api/projects/images/{project_id}/{filename}"
        except Exception as e:
            logger.warning(f"Failed to download image {url}: {e}")
            return url

    async def download_all_images(self, project_id: str) -> dict:
        project = self.get(project_id)
        if not project:
            raise FileNotFoundError(f"Project {project_id} not found")

        state = project.get("conversation_state", {})
        results = {"keyElementsImages": {}, "shotImages": {}}

        key_images = state.get("keyElementsImages", {})
        for key, url in key_images.items():
            if url and url.startswith("http"):
                safe_key = key.replace("/", "_").replace("\\", "_")
                filename = f"char_{safe_key}.png"
                local_path = await self.download_image(project_id, url, filename)
                results["keyElementsImages"][key] = local_path
            else:
                results["keyElementsImages"][key] = url

        shot_images = state.get("shotImages", {})
        for key, url in shot_images.items():
            if url and url.startswith("http"):
                filename = f"shot_{key}.png"
                local_path = await self.download_image(project_id, url, filename)
                results["shotImages"][key] = local_path
            else:
                results["shotImages"][key] = url

        state["keyElementsImages"] = results["keyElementsImages"]
        state["shotImages"] = results["shotImages"]
        self.update(project_id, {"conversation_state": state})

        return results

    def _save(self, project: dict):
        path = self._project_path(project["id"])
        with open(path, "w", encoding="utf-8") as f:
            json.dump(project, f, ensure_ascii=False, indent=2)

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()


project_store = ProjectStore()
