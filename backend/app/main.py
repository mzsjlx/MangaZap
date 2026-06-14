import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.platform import platform_detector
from .core.security import get_secure_executor
from .api.error_reports import router as error_reports_router
from .api.templates import router as templates_router
from .api.config import router as config_router
from .api.generate import router as generate_router
from .api.chat import router as chat_router
from .api.models import router as models_router
from .api.upload import router as upload_router
from .api.image import router as image_router
from .api.projects import router as projects_router
from .api.voice import router as voice_router
from .api.video import router as video_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="MangaZap", version="0.1.0")

# CORS configuration
ALLOWED_ORIGINS = os.getenv("MANGAZAP_CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(error_reports_router)
app.include_router(templates_router)
app.include_router(config_router)
app.include_router(generate_router)
app.include_router(chat_router)
app.include_router(models_router)
app.include_router(upload_router)
app.include_router(image_router)
app.include_router(projects_router)
app.include_router(voice_router)
app.include_router(video_router)


@app.on_event("startup")
async def startup_event():
    logger.info("=== MangaZap starting ===")
    platform_detector.print_startup_info()
    get_secure_executor()

    if platform_detector.platform.value == "windows" and not platform_detector.is_docker:
        logger.warning("=" * 60)
        logger.warning("Windows platform detected")
        logger.warning("Process isolation unavailable, degraded to thread mode")
        logger.warning("API keys may persist in memory")
        logger.warning("")
        logger.warning("Recommended:")
        logger.warning("  1. WSL2: wsl --install")
        logger.warning("  2. Docker Desktop")
        logger.warning("  3. Linux/macOS native")
        logger.warning("=" * 60)

    logger.info("MangaZap started")


@app.on_event("shutdown")
async def shutdown_event():
    executor = get_secure_executor()
    executor.shutdown()
    logger.info("MangaZap shutdown")


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/platform")
async def get_platform_info():
    return platform_detector.get_info()
