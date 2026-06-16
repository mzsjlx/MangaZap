import os


# Chat/Text API
CHAT_BASE_URL = os.getenv("MIMO_API_BASE", "https://api.mimo.com/v1")
CHAT_MODEL = os.getenv("MIMO_MODEL", "mimo-v2.5")

# Image API (Agnes AI)
IMAGE_BASE_URL = os.getenv("IMAGE_API_BASE", "https://apihub.agnes-ai.com/v1")
IMAGE_MODEL = os.getenv("IMAGE_MODEL", "agnes-image-2.0-flash")
IMAGE_SIZE = os.getenv("IMAGE_DEFAULT_SIZE", "1024x1024")

# Video API (Agnes AI)
VIDEO_BASE_URL = os.getenv("VIDEO_API_BASE", "https://apihub.agnes-ai.com/v1")
VIDEO_MODEL = os.getenv("VIDEO_MODEL", "agnes-video-v2.0")

# TTS API (MiMo voice)
TTS_BASE_URL = os.getenv("TTS_API_BASE", "https://token-plan-cn.xiaomimimo.com/v1")
TTS_MODEL = os.getenv("TTS_MODEL", "mimo-v2.5-tts")
