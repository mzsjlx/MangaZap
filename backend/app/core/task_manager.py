import json
import logging
from pathlib import Path
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

TASKS_DIR = Path("data/tasks")
TASKS_DIR.mkdir(parents=True, exist_ok=True)


class TaskManager:
    """Manages task pause/resume state for generation pipeline."""

    def save_task(self, task_id: str, project_id: str, step_id: str, context: dict) -> None:
        task_data = {
            "task_id": task_id,
            "project_id": project_id,
            "step_id": step_id,
            "context": context,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        path = self._task_path(task_id)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(task_data, f, ensure_ascii=False, indent=2)
        logger.info(f"Task saved: {task_id} step={step_id}")

    def load_task(self, task_id: str) -> dict | None:
        path = self._task_path(task_id)
        if not path.exists():
            return None
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def save_task_state(self, task_id: str, project_id: str, step_id: str, waiting_for: str, state_snapshot: dict | None = None) -> None:
        self.save_task(task_id, project_id, step_id, state_snapshot or {})

    def get_task_state(self, task_id: str) -> dict | None:
        return self.load_task(task_id)

    def mark_confirmed(self, task_id: str, confirm_data: dict | None = None) -> dict | None:
        task_data = self.get_task_state(task_id)
        if not task_data:
            return None
        task_data["confirmed"] = True
        task_data["confirm_data"] = confirm_data or {}
        task_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        path = self._task_path(task_id)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(task_data, f, ensure_ascii=False, indent=2)
        logger.info(f"Task confirmed: {task_id}")
        return task_data

    def delete_task(self, task_id: str) -> bool:
        path = self._task_path(task_id)
        if path.exists():
            path.unlink()
            return True
        return False

    def list_pending_tasks(self) -> list[dict]:
        tasks = []
        for path in TASKS_DIR.glob("*.json"):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    task = json.load(f)
                if not task.get("confirmed"):
                    tasks.append(task)
            except Exception:
                continue
        return tasks

    def _task_path(self, task_id: str) -> Path:
        return TASKS_DIR / f"{task_id}.json"


task_manager = TaskManager()
