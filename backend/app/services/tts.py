import os
import logging
import asyncio
import subprocess
from pathlib import Path
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

EDGE_TTS_VOICE = os.getenv("EDGE_TTS_VOICE", "zh-CN-YunxiNeural")
EDGE_TTS_RATE = os.getenv("EDGE_TTS_RATE", "+0%")


async def generate_tts_stream(
    scenes: list[dict],
    project_id: str,
) -> AsyncGenerator[dict, None]:
    yield {"step": "tts", "message": "Preparing TTS generation...", "progress": 45}

    output_dir = Path(f"data/projects/{project_id}/audio")
    output_dir.mkdir(parents=True, exist_ok=True)

    audio_paths = []
    has_edge_tts = _check_edge_tts()

    if not has_edge_tts:
        yield {"step": "tts", "message": "edge-tts not available, creating silent audio", "progress": 47}
        for i, scene in enumerate(scenes):
            progress = 45 + int(15 * (i + 1) / len(scenes))
            yield {"step": "tts", "message": f"Creating silent audio {i + 1}/{len(scenes)}", "progress": progress}
            audio_path = _create_silent_audio(output_dir, i, scene.get("duration", 5))
            audio_paths.append(str(audio_path))
        yield {"step": "tts", "message": f"All {len(audio_paths)} audio files created", "progress": 60, "data": {"audio_paths": audio_paths}}
        return

    yield {"step": "tts", "message": f"Using edge-tts voice: {EDGE_TTS_VOICE}", "progress": 47}

    for i, scene in enumerate(scenes):
        progress = 45 + int(15 * (i + 1) / len(scenes))
        narration = scene.get("narration", "").strip()

        if not narration:
            yield {"step": "tts", "message": f"Scene {i + 1}: no narration, creating silence", "progress": progress}
            audio_path = _create_silent_audio(output_dir, i, scene.get("duration", 5))
            audio_paths.append(str(audio_path))
            continue

        yield {"step": "tts", "message": f"Generating TTS {i + 1}/{len(scenes)}: {narration[:30]}...", "progress": progress}

        audio_path = output_dir / f"scene_{i + 1:03d}.mp3"

        for attempt in range(3):
            try:
                await _generate_edge_tts(narration, audio_path)
                audio_paths.append(str(audio_path))
                yield {"step": "tts", "message": f"TTS {i + 1} generated", "progress": progress}
                break
            except Exception as e:
                logger.warning(f"TTS attempt {attempt + 1} failed: {e}")
                if attempt < 2:
                    yield {"step": "tts", "message": f"Retry {attempt + 2}/3 for TTS {i + 1}...", "progress": progress}
                else:
                    yield {"step": "tts", "message": f"Failed TTS {i + 1}, using silence", "progress": progress}
                    audio_path = _create_silent_audio(output_dir, i, scene.get("duration", 5))
                    audio_paths.append(str(audio_path))

    yield {"step": "tts", "message": f"All {len(audio_paths)} audio files generated", "progress": 60, "data": {"audio_paths": audio_paths}}


def _check_edge_tts() -> bool:
    try:
        result = subprocess.run(
            ["edge-tts", "--version"],
            capture_output=True,
            timeout=5,
        )
        return result.returncode == 0
    except Exception:
        try:
            import edge_tts
            return True
        except ImportError:
            return False


async def _generate_edge_tts(text: str, output_path: Path):
    try:
        import edge_tts

        communicate = edge_tts.Communicate(text, EDGE_TTS_VOICE, rate=EDGE_TTS_RATE)
        await communicate.save(str(output_path))
    except ImportError:
        proc = await asyncio.create_subprocess_exec(
            "edge-tts",
            "--voice", EDGE_TTS_VOICE,
            "--rate", EDGE_TTS_RATE,
            "--text", text,
            "--write-media", str(output_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"edge-tts failed: {stderr.decode()}")


def _create_silent_audio(output_dir: Path, index: int, duration: float) -> Path:
    audio_path = output_dir / f"scene_{index + 1:03d}.mp3"

    ffmpeg = _get_ffmpeg_path()
    if ffmpeg:
        try:
            subprocess.run(
                [
                    ffmpeg, "-y",
                    "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo",
                    "-t", str(duration),
                    "-c:a", "libmp3lame",
                    "-q:a", "9",
                    str(audio_path),
                ],
                capture_output=True,
                timeout=10,
            )
            if audio_path.exists():
                return audio_path
        except Exception as e:
            logger.warning(f"FFmpeg silent audio failed: {e}")

    with open(audio_path, "wb") as f:
        f.write(b"\xff" * 1000)
    return audio_path


def _get_ffmpeg_path() -> str | None:
    try:
        result = subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        if result.returncode == 0:
            return "ffmpeg"
    except Exception:
        pass
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe:
            result = subprocess.run([exe, "-version"], capture_output=True, timeout=5)
            if result.returncode == 0:
                return exe
    except Exception:
        pass
    return None
