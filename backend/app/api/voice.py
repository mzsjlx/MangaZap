import base64
import logging
import httpx
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.defaults import TTS_BASE_URL, TTS_MODEL

logger = logging.getLogger(__name__)
router = APIRouter()


class VoiceGenerateRequest(BaseModel):
    text: str
    model: str = TTS_MODEL
    voice: str = ""
    api_key: str
    base_url: str = TTS_BASE_URL


class VoiceGenerateResponse(BaseModel):
    audio_url: str
    waveform: list[float]


def generate_waveform(audio_bytes: bytes, points: int = 20) -> list[float]:
    """Generate amplitude points from audio data."""
    try:
        audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
        if len(audio_array) == 0:
            return [0.0] * points
        segment_size = max(1, len(audio_array) // points)
        waveform = []
        for i in range(points):
            start = i * segment_size
            end = min(start + segment_size, len(audio_array))
            segment = audio_array[start:end]
            if len(segment) > 0:
                amplitude = float(np.max(np.abs(segment)) / 32768.0)
            else:
                amplitude = 0.0
            waveform.append(amplitude)
        return waveform
    except Exception as e:
        logger.warning(f"[voice] Waveform generation failed: {e}")
        return [0.5] * points


@router.post("/api/voice/generate", response_model=VoiceGenerateResponse)
async def generate_voice(request: VoiceGenerateRequest):
    """Generate TTS audio via MiMo chat completions endpoint."""
    print(f"[voice] START, text length: {len(request.text)}, model: {request.model}")
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            url = f"{request.base_url.rstrip('/')}/chat/completions"
            logger.info(f"[voice.generate] Calling {url} with model={request.model}")

            payload = {
                "model": request.model,
                "messages": [
                    {"role": "assistant", "content": request.text}
                ],
            }
            if request.voice:
                payload["voice"] = request.voice

            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {request.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

            if response.status_code != 200:
                logger.error(f"[voice.generate] API error: {response.status_code} - {response.text[:200]}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Voice API error: {response.text[:200]}",
                )

            data = response.json()
            audio_b64 = None
            try:
                audio_b64 = data["choices"][0]["message"]["audio"]["data"]
            except (KeyError, IndexError) as e:
                logger.error(f"[voice.generate] Unexpected response structure: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Unexpected TTS response structure: {str(e)}")

            if not audio_b64:
                raise HTTPException(status_code=500, detail="No audio data in TTS response")

            audio_bytes = base64.b64decode(audio_b64)
            if len(audio_bytes) < 100:
                raise HTTPException(status_code=500, detail="Audio response too small")

            audio_url = f"data:audio/wav;base64,{audio_b64}"
            waveform = generate_waveform(audio_bytes, points=20)

            print(f"[voice] SUCCESS, audio size: {len(audio_bytes)}, waveform points: {len(waveform)}")
            logger.info(f"[voice.generate] Success, audio size: {len(audio_bytes)}")
            return VoiceGenerateResponse(audio_url=audio_url, waveform=waveform)

    except httpx.TimeoutException as e:
        print(f"[voice] TIMEOUT: {str(e)}")
        raise HTTPException(status_code=504, detail=f"Voice API timeout: {str(e)}")
    except httpx.HTTPStatusError as e:
        print(f"[voice] HTTP ERROR: {e.response.status_code}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Voice API error: {e.response.text[:200]}",
        )
    except httpx.RequestError as e:
        print(f"[voice] CONNECTION ERROR: {str(e)}")
        raise HTTPException(status_code=503, detail=f"Connection error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[voice] ERROR: {type(e).__name__}: {str(e)}")
        logger.error(f"[voice.generate] Failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
