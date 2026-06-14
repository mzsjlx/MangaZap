import uuid
import platform
import sys
import traceback
import json
import os
from datetime import datetime, timezone


class ErrorReporter:
    def __init__(self, report_dir: str = "data/error_reports"):
        self.report_dir = report_dir
        os.makedirs(report_dir, exist_ok=True)

    def generate_report(
        self,
        error: Exception,
        context: dict | None = None,
        user_actions: list[str] | None = None,
    ) -> dict:
        report_id = uuid.uuid4().hex[:12]
        report = {
            "report_id": report_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "error": {
                "type": type(error).__name__,
                "message": str(error),
                "traceback": traceback.format_exc(),
            },
            "environment": {
                "os": platform.system(),
                "os_version": platform.version(),
                "python_version": sys.version,
                "architecture": platform.machine(),
            },
            "context": context or {},
            "user_actions": user_actions or [],
        }

        filepath = os.path.join(self.report_dir, f"error_report_{report_id}.json")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        return report


error_reporter = ErrorReporter()
