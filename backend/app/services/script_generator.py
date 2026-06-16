import os
import json
import logging
import httpx
from typing import AsyncGenerator
from app.core import defaults

logger = logging.getLogger(__name__)

MIMO_API_BASE = os.getenv("MIMO_API_BASE", defaults.CHAT_BASE_URL)
MIMO_API_KEY = os.getenv("MIMO_API_KEY", "")
MIMO_MODEL = os.getenv("MIMO_MODEL", defaults.CHAT_MODEL)

SCRIPT_PROMPT_TEMPLATE = """You are a professional manga storyboard writer. Based on the user's idea, generate a detailed script in JSON format.

User Idea: {idea}
Art Style: {style}
Target Duration: {duration} seconds

Requirements:
1. Break the story into {scene_count} scenes
2. Each scene should have a clear visual description for image generation
3. Include narration text for each scene (will be used for TTS)
4. Write detailed image generation prompts

Output ONLY valid JSON (no markdown, no explanation):
{{
  "title": "string",
  "synopsis": "string (2-3 sentences)",
  "scenes": [
    {{
      "id": 1,
      "title": "string",
      "description": "string (visual description)",
      "prompt": "string (detailed image generation prompt, include style keywords)",
      "narration": "string (narrator text, will be spoken aloud)",
      "duration": 15
    }}
  ]
}}"""


def _resolve_api_key(api_keys: dict | None = None) -> str:
    if api_keys and api_keys.get("text"):
        return api_keys["text"]
    return _get_api_key()


def _get_api_key() -> str:
    key = MIMO_API_KEY
    if key:
        return key
    try:
        from ..core.security import get_secure_executor
        executor = get_secure_executor()
        return executor.key_manager.get_key("mimo")
    except Exception:
        return ""


def _get_api_base() -> str:
    if MIMO_API_BASE != defaults.CHAT_BASE_URL:
        return MIMO_API_BASE
    try:
        from ..core.security import get_secure_executor
        executor = get_secure_executor()
        return executor.key_manager.get_key("mimo_api_base")
    except Exception:
        return MIMO_API_BASE


def _get_model() -> str:
    if MIMO_MODEL != defaults.CHAT_MODEL:
        return MIMO_MODEL
    try:
        from ..core.security import get_secure_executor
        executor = get_secure_executor()
        return executor.key_manager.get_key("mimo_model")
    except Exception:
        return MIMO_MODEL


async def generate_script_stream(
    idea: str,
    style: str,
    duration: int,
    api_keys: dict | None = None,
) -> AsyncGenerator[dict, None]:
    yield {"step": "script", "message": "Preparing script generation...", "progress": 5}

    scene_count = max(2, duration // 15)
    prompt = SCRIPT_PROMPT_TEMPLATE.format(
        idea=idea,
        style=style,
        duration=duration,
        scene_count=scene_count,
    )

    api_key = _resolve_api_key(api_keys)
    if not api_key:
        yield {
            "step": "missing_api",
            "api_type": "text",
            "message": "未配置文本生成 API（MiMo/OpenAI），请提供 API 密钥后继续。",
        }
        yield {"step": "script", "message": "No API key configured, using fallback generation", "progress": 10}
        script = _generate_fallback(idea, style, duration, scene_count)
        yield {"step": "script", "message": f"Fallback script generated: {len(script['scenes'])} scenes", "progress": 30, "data": script}
        return

    yield {"step": "script", "message": "Calling MiMo API for script generation...", "progress": 10}

    for attempt in range(3):
        try:
            script = await _call_mimo_api(prompt, api_keys)
            yield {"step": "script", "message": f"Script generated: {len(script['scenes'])} scenes", "progress": 30, "data": script}
            return
        except Exception as e:
            logger.warning(f"MiMo API attempt {attempt + 1} failed: {e}")
            if attempt < 2:
                yield {"step": "script", "message": f"Retry {attempt + 2}/3...", "progress": 10 + attempt * 5}
            else:
                yield {"step": "script", "message": f"API failed after 3 attempts: {e}, using fallback", "progress": 15}
                script = _generate_fallback(idea, style, duration, scene_count)
                yield {"step": "script", "message": f"Fallback script generated: {len(script['scenes'])} scenes", "progress": 30, "data": script}


async def _call_mimo_api(prompt: str, api_keys: dict | None = None) -> dict:
    api_key = _resolve_api_key(api_keys)
    if not api_key:
        raise RuntimeError("No API key configured")

    api_base = _get_api_base()
    model = _get_model()

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{api_base}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are a professional script writer. Output only valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.7,
                "max_tokens": 4096,
            },
        )

        if response.status_code != 200:
            error_body = response.text[:500]
            logger.error(f"MiMo API error {response.status_code}: {error_body}")
            raise RuntimeError(f"MiMo API returned {response.status_code}: {error_body}")

        data = response.json()
        message = data["choices"][0]["message"]
        content = message.get("content") or message.get("reasoning_content") or ""

        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        script = json.loads(content)

        if "scenes" not in script or not isinstance(script["scenes"], list):
            raise ValueError("Invalid script format: missing scenes array")

        for i, scene in enumerate(script["scenes"]):
            scene.setdefault("id", i + 1)
            scene.setdefault("title", f"Scene {i + 1}")
            scene.setdefault("description", "")
            scene.setdefault("prompt", "")
            scene.setdefault("narration", "")
            scene.setdefault("duration", 15)

        return script


def _generate_fallback(idea: str, style: str, duration: int, scene_count: int) -> dict:
    scene_duration = duration // scene_count
    scenes = []
    for i in range(scene_count):
        scenes.append({
            "id": i + 1,
            "title": f"Scene {i + 1}",
            "description": f"Scene {i + 1}: {idea}",
            "prompt": f"{style} style, high quality, detailed, {idea}, scene {i + 1} of {scene_count}, manga panel",
            "narration": f"This is scene {i + 1} of our story about {idea}.",
            "duration": scene_duration,
        })
    return {
        "title": idea[:50],
        "synopsis": f"A {style}-style story about: {idea}",
        "scenes": scenes,
    }
