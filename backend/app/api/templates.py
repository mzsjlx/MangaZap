import os
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse

from ..core.template_manager import template_manager

router = APIRouter()


@router.get("/api/templates")
async def list_templates():
    return {"templates": template_manager.list_templates()}


@router.get("/api/templates/{template_id}")
async def get_template(template_id: str):
    template = template_manager.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("/api/templates")
async def create_template(data: dict):
    try:
        template = template_manager.create_template(
            name=data.get("name", "Untitled"),
            description=data.get("description", ""),
            source_files=data.get("files", []),
            author=data.get("author", "user"),
            is_official=data.get("is_official", False),
        )
        return template
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/api/templates/export/{template_id}")
async def export_template(template_id: str):
    try:
        result = template_manager.export_template(template_id)
        return FileResponse(
            path=result["flova_path"],
            filename=f"{template_id}.flova",
            media_type="application/zip",
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/templates/import")
async def import_template(
    file: UploadFile = File(...),
    sig_file: UploadFile | None = File(None),
):
    try:
        os.makedirs("data/templates/uploads", exist_ok=True)
        temp_dir = "data/templates/uploads"

        flova_path = os.path.join(temp_dir, file.filename)
        with open(flova_path, "wb") as f:
            content = await file.read()
            f.write(content)

        sig_path = None
        if sig_file:
            sig_path = os.path.join(temp_dir, sig_file.filename)
            with open(sig_path, "wb") as f:
                sig_content = await sig_file.read()
                f.write(sig_content)

        result = template_manager.import_template(flova_path, sig_path)

        os.remove(flova_path)
        if sig_path and os.path.exists(sig_path):
            os.remove(sig_path)

        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/api/templates/{template_id}")
async def delete_template(template_id: str):
    if template_manager.delete_template(template_id):
        return {"status": "deleted", "id": template_id}
    raise HTTPException(status_code=404, detail="Template not found")
