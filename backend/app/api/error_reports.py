import os
import json
import urllib.parse
import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..core.error_reporter import error_reporter

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_URL_LENGTH = 8000
REPO_OWNER = "mangazap"
REPO_NAME = "mangazap"


def _build_diagnostic_text(report: dict, title: str) -> str:
    lines = [
        title,
        "",
        f"Report ID: {report['report_id']}",
        f"Time: {report['timestamp']}",
        "",
        f"Error: {report['error']['type']}: {report['error']['message']}",
        "",
        f"OS: {report['environment']['os']} {report['environment']['os_version']}",
        f"Python: {report['environment']['python_version']}",
        f"Arch: {report['environment']['architecture']}",
        "",
        "Traceback:",
        report['error']['traceback'] or 'N/A',
        "",
        "User Actions:",
    ]
    for action in report.get('user_actions', []):
        lines.append(f"  - {action}")
    if not report.get('user_actions'):
        lines.append("  None")
    return "\n".join(lines)


@router.post("/api/error-reports/generate")
async def generate_error_report(error_data: dict):
    try:
        report = error_reporter.generate_report(
            error=Exception(error_data.get("message", "Unknown error")),
            context=error_data.get("context", {}),
            user_actions=error_data.get("user_actions", []),
        )

        title = f"[Bug] {report['error']['type']}: {report['error']['message'][:50]}"

        body = f"""## Error Report

**Report ID:** {report['report_id']}
**Time:** {report['timestamp']}

### Error Info
- **Type:** {report['error']['type']}
- **Message:** {report['error']['message']}

### Environment
- **OS:** {report['environment']['os']} {report['environment']['os_version']}
- **Python:** {report['environment']['python_version']}
- **Arch:** {report['environment']['architecture']}

### Traceback
```python
{report['error']['traceback']}
```

### User Actions
{chr(10).join(f'- {a}' for a in report['user_actions']) if report['user_actions'] else 'None'}

### Steps to Reproduce
1. 2. 3.

### Expected Behavior


### Actual Behavior

"""

        encoded_title = urllib.parse.quote(title)
        encoded_body = urllib.parse.quote(body)
        github_url = f"https://github.com/{REPO_OWNER}/{REPO_NAME}/issues/new?title={encoded_title}&body={encoded_body}"

        url_too_long = len(github_url) > MAX_URL_LENGTH
        if url_too_long:
            logger.warning(f"Error report URL too long ({len(github_url)} chars), limit {MAX_URL_LENGTH}")

        report_filename = f"error_report_{report['report_id']}.json"
        report_filepath = f"data/error_reports/{report_filename}"

        with open(report_filepath, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        diagnostic_text = _build_diagnostic_text(report, title)

        return {
            "report_id": report["report_id"],
            "github_url": github_url if not url_too_long else None,
            "report_file": report_filename,
            "title": title,
            "url_too_long": url_too_long,
            "diagnostic_text": diagnostic_text,
            "message": "Error report generated" + (", but URL too long, please copy diagnostics manually" if url_too_long else ""),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/error-reports/{report_id}")
async def get_error_report(report_id: str):
    filepath = f"data/error_reports/error_report_{report_id}.json"
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Report not found")
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get("/api/error-reports/{report_id}/download")
async def download_error_report(report_id: str):
    filepath = f"data/error_reports/error_report_{report_id}.json"
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(
        path=filepath,
        filename=f"error_report_{report_id}.json",
        media_type="application/json",
    )
