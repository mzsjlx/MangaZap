import os
import uuid
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

logger = logging.getLogger(__name__)

router = APIRouter()

UPLOAD_DIR = "data/uploads"

ALLOWED_TYPES = {
    "image": {
        "extensions": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"],
        "mime_prefix": "image/",
        "label": "图片",
        "max_size": 20 * 1024 * 1024,  # 20MB
    },
    "audio": {
        "extensions": [".mp3", ".wav", ".ogg", ".aac", ".flac", ".m4a", ".wma"],
        "mime_prefix": "audio/",
        "label": "音频",
        "max_size": 50 * 1024 * 1024,  # 50MB
    },
    "video": {
        "extensions": [".mp4", ".webm", ".avi", ".mov", ".mkv", ".flv", ".wmv"],
        "mime_prefix": "video/",
        "label": "视频",
        "max_size": 200 * 1024 * 1024,  # 200MB
    },
    "text": {
        "extensions": [".txt", ".pdf", ".docx", ".doc", ".md", ".json", ".csv", ".srt", ".ass"],
        "mime_prefix": ["text/", "application/pdf", "application/msword", "application/vnd.openxmlformats"],
        "label": "文本",
        "max_size": 10 * 1024 * 1024,  # 10MB
    },
}


def detect_file_type(filename: str, content_type: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    for file_type, config in ALLOWED_TYPES.items():
        if ext in config["extensions"]:
            return file_type
        if isinstance(config["mime_prefix"], list):
            if any(content_type.startswith(p) for p in config["mime_prefix"]):
                return file_type
        elif content_type.startswith(config["mime_prefix"]):
            return file_type
    return "unknown"


@router.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    file_type = detect_file_type(file.filename or "", file.content_type or "")
    if file_type == "unknown":
        raise HTTPException(status_code=400, detail="不支持的文件类型")

    config = ALLOWED_TYPES[file_type]
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in config["extensions"]:
        raise HTTPException(status_code=400, detail=f"不支持的{config['label']}格式: {ext}")

    content = await file.read()
    if len(content) > config["max_size"]:
        max_mb = config["max_size"] // (1024 * 1024)
        raise HTTPException(status_code=400, detail=f"{config['label']}文件大小超过限制（最大 {max_mb}MB）")

    file_id = str(uuid.uuid4())[:8]
    safe_name = f"{file_id}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_name)

    with open(file_path, "wb") as f:
        f.write(content)

    logger.info(f"File uploaded: {file.filename} -> {file_path} ({file_type}, {len(content)} bytes)")

    return {
        "file_id": file_id,
        "filename": file.filename,
        "file_type": file_type,
        "file_path": file_path,
        "size": len(content),
    }


@router.get("/api/upload/formats")
async def get_upload_formats():
    formats = {}
    for file_type, config in ALLOWED_TYPES.items():
        formats[file_type] = {
            "label": config["label"],
            "extensions": config["extensions"],
            "max_size_mb": config["max_size"] // (1024 * 1024),
        }
    return formats


@router.get("/api/files/{filename}")
async def get_uploaded_file(filename: str):
    """提供已上传文件的访问"""
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")

    ext = os.path.splitext(filename)[1].lower()
    mime_types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
    }
    media_type = mime_types.get(ext, 'application/octet-stream')

    return FileResponse(file_path, media_type=media_type)
