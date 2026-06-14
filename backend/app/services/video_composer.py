import os
import logging
import subprocess
import json
from pathlib import Path
from typing import AsyncGenerator

logger = logging.getLogger(__name__)


PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


async def compose_video_stream(
    project_id: str,
    image_paths: list[str],
    audio_paths: list[str],
    scenes: list[dict],
) -> AsyncGenerator[dict, None]:
    yield {"step": "video", "message": "Preparing video composition...", "progress": 90}

    output_dir = PROJECT_ROOT / "data" / "projects" / project_id
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "output.mp4"

    ffmpeg = _get_ffmpeg()
    if not ffmpeg:
        yield {"step": "video", "message": "FFmpeg not available, creating placeholder", "progress": 92}
        _create_placeholder(output_path)
        yield {"step": "video", "message": f"Placeholder saved to {output_path}", "progress": 100, "data": {"video_path": str(output_path)}}
        return

    yield {"step": "video", "message": "Generating subtitles...", "progress": 91}
    srt_path = _generate_srt(scenes, output_dir)

    yield {"step": "video", "message": "Creating scene clips...", "progress": 93}
    scene_clips = []
    for i, (img, aud) in enumerate(zip(image_paths, audio_paths)):
        clip_path = output_dir / f"clip_{i:03d}.mp4"
        scene = scenes[i] if i < len(scenes) else {}
        duration = scene.get("duration", 5)

        success = _create_scene_clip(ffmpeg, img, aud, clip_path, duration)
        if success and clip_path.exists():
            scene_clips.append(clip_path)
            yield {"step": "video", "message": f"Clip {i + 1}/{len(image_paths)} created", "progress": 93 + int(4 * (i + 1) / len(image_paths))}

    if not scene_clips:
        yield {"step": "video", "message": "No clips generated, creating placeholder", "progress": 97}
        _create_placeholder(output_path)
        yield {"step": "video", "message": f"Placeholder saved to {output_path}", "progress": 100, "data": {"video_path": str(output_path)}}
        return

    yield {"step": "video", "message": f"Concatenating {len(scene_clips)} clips...", "progress": 97}
    concat_success = _concat_clips(ffmpeg, scene_clips, output_path, srt_path)

    for clip in scene_clips:
        clip.unlink(missing_ok=True)

    if concat_success and output_path.exists():
        yield {"step": "video", "message": f"Video saved to {output_path}", "progress": 100, "data": {"video_path": str(output_path)}}
    else:
        yield {"step": "video", "message": "Concatenation failed, creating placeholder", "progress": 99}
        _create_placeholder(output_path)
        yield {"step": "video", "message": f"Placeholder saved to {output_path}", "progress": 100, "data": {"video_path": str(output_path)}}


def _get_ffmpeg() -> str | None:
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


def _create_scene_clip(ffmpeg: str, image_path: str, audio_path: str, output_path: Path, duration: float) -> bool:
    try:
        img_abs = str(PROJECT_ROOT / image_path) if not Path(image_path).is_absolute() else image_path
        aud_abs = str(PROJECT_ROOT / audio_path) if not Path(audio_path).is_absolute() else audio_path
        cmd = [
            ffmpeg, "-y",
            "-loop", "1",
            "-i", img_abs,
            "-i", aud_abs,
            "-c:v", "libx264",
            "-t", str(duration),
            "-pix_fmt", "yuv420p",
            "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
            "-r", "24",
            "-c:a", "aac",
            "-b:a", "128k",
            "-shortest",
            str(output_path),
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            logger.error(f"Scene clip failed: {result.stderr.decode(errors='replace')[:300]}")
        return result.returncode == 0
    except Exception as e:
        logger.error(f"Scene clip creation failed: {e}")
        return False


def _concat_clips(ffmpeg: str, clips: list[Path], output_path: Path, srt_path: Path | None) -> bool:
    try:
        concat_file = output_path.parent / "concat.txt"
        with open(concat_file, "w", encoding="utf-8") as f:
            for clip in clips:
                f.write(f"file '{clip.name}'\n")

        cmd = [
            ffmpeg, "-y",
            "-f", "concat", "-safe", "0",
            "-i", concat_file.name,
            "-c:v", "libx264",
            "-c:a", "aac",
            "-pix_fmt", "yuv420p",
        ]

        if srt_path and srt_path.exists():
            cmd.extend(["-vf", f"subtitles={srt_path.name}"])

        cmd.append(output_path.name)

        result = subprocess.run(cmd, capture_output=True, timeout=300, cwd=output_path.parent)
        concat_file.unlink(missing_ok=True)
        if result.returncode != 0:
            logger.error(f"FFmpeg concat failed: {result.stderr.decode(errors='replace')[:500]}")
        return result.returncode == 0
    except Exception as e:
        logger.error(f"Concatenation failed: {e}")
        return False


def _generate_srt(scenes: list[dict], output_dir: Path) -> Path:
    srt_path = output_dir / "subtitles.srt"
    lines = []
    current_time = 0.0

    for i, scene in enumerate(scenes):
        duration = scene.get("duration", 5)
        narration = scene.get("narration", "")
        if not narration:
            continue

        start = _format_srt_time(current_time)
        end = _format_srt_time(current_time + duration)

        lines.append(f"{i + 1}")
        lines.append(f"{start} --> {end}")
        lines.append(narration)
        lines.append("")

        current_time += duration

    with open(srt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return srt_path


def _format_srt_time(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def _create_placeholder(output_path: Path):
    try:
        _create_valid_mp4(output_path)
    except Exception:
        try:
            with open(output_path, "wb") as f:
                f.write(b"\x00\x00\x00\x1cftypisom" + b"\x00" * 1000)
        except Exception:
            pass


def _create_valid_mp4(output_path: Path, width=320, height=240, duration_sec=5, fps=24):
    import struct
    total_frames = duration_sec * fps
    timescale = fps

    with open(output_path, "wb") as f:
        # ftyp box
        ftyp_data = b"isom" + struct.pack(">I", 0x200) + b"isomiso2mp41"
        _write_box(f, b"ftyp", ftyp_data)

        # moov box
        moov_children = b""

        # mvhd
        mvhd = struct.pack(">I", 0)
        mvhd += struct.pack(">I", 0)
        mvhd += struct.pack(">I", 0)
        mvhd += struct.pack(">I", timescale)
        mvhd += struct.pack(">I", total_frames)
        mvhd += struct.pack(">I", 0x00010000)
        mvhd += struct.pack(">H", 0x0100)
        mvhd += b"\x00" * 10
        mvhd += struct.pack(">9I", 0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000)
        mvhd += b"\x00" * 24
        mvhd += struct.pack(">I", 2)
        moov_children += _write_box_raw(b"mvhd", mvhd)

        # trak
        trak_children = b""

        # tkhd
        tkhd = struct.pack(">I", 0x00000003)
        tkhd += struct.pack(">I", 0)
        tkhd += struct.pack(">I", 0)
        tkhd += struct.pack(">I", 1)
        tkhd += struct.pack(">I", 0)
        tkhd += struct.pack(">I", total_frames)
        tkhd += b"\x00" * 8
        tkhd += struct.pack(">H", 0)
        tkhd += struct.pack(">H", 0)
        tkhd += struct.pack(">H", 0)
        tkhd += struct.pack(">H", 0)
        tkhd += struct.pack(">9I", 0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000)
        tkhd += struct.pack(">I", width << 16)
        tkhd += struct.pack(">I", height << 16)
        trak_children += _write_box_raw(b"tkhd", tkhd)

        # mdia
        mdia_children = b""

        # mdhd
        mdhd = struct.pack(">I", 0)
        mdhd += struct.pack(">I", 0)
        mdhd += struct.pack(">I", 0)
        mdhd += struct.pack(">I", timescale)
        mdhd += struct.pack(">I", total_frames)
        mdhd += struct.pack(">I", 0x55C40000)
        mdia_children += _write_box_raw(b"mdhd", mdhd)

        # hdlr
        hdlr = struct.pack(">I", 0)
        hdlr += struct.pack(">I", 0)
        hdlr += b"vide"
        hdlr += b"\x00" * 12
        hdlr += b"VideoHandler\x00"
        mdia_children += _write_box_raw(b"hdlr", hdlr)

        # minf
        minf_children = b""

        # vmhd
        vmhd = struct.pack(">I", 0x00000001)
        vmhd += struct.pack(">4H", 0, 0, 0, 0)
        minf_children += _write_box_raw(b"vmhd", vmhd)

        # dinf
        dref = struct.pack(">I", 0)
        dref += struct.pack(">I", 1)
        dref += struct.pack(">I", 12)
        dref += b"url "
        dref += struct.pack(">I", 0x00000001)
        minf_children += _write_box_raw(b"dinf", dref)

        # stbl
        stbl_children = b""

        # stsd
        stsd = struct.pack(">I", 0)
        stsd += struct.pack(">I", 1)
        avc1 = b"\x00" * 6
        avc1 += struct.pack(">H", 0)
        avc1 += b"\x00" * 16
        avc1 += struct.pack(">H", width)
        avc1 += struct.pack(">H", height)
        avc1 += struct.pack(">I", 0x00480000)
        avc1 += struct.pack(">I", 0x00480000)
        avc1 += struct.pack(">I", 0)
        avc1 += struct.pack(">H", 1)
        avc1 += b"\x00" * 32
        avc1 += struct.pack(">H", 0x0018)
        avc1 += struct.pack(">h", -1)

        avcc = struct.pack(">BBH", 0x01, 0x64, 0x00)
        avcc += struct.pack(">B", 0x1E)
        avcc += struct.pack(">B", 0xFF)
        avcc += struct.pack(">B", 0xE0)
        sps = bytes([0x67, 0x42, 0x00, 0x0A, 0xE9, 0x40, 0x40, 0x20, 0x00, 0x00, 0x03, 0x00, 0x20, 0x00, 0x00, 0x03, 0x01, 0xC0, 0x24, 0x14, 0x01, 0x6E, 0x2C, 0x00, 0x10])
        avcc += struct.pack(">H", len(sps))
        avcc += sps
        avcc += struct.pack(">B", 0)
        avc1 += _write_box_raw(b"avcC", avcc)
        stsd += _write_box_raw(b"avc1", avc1)
        stbl_children += _write_box_raw(b"stsd", stsd)

        # stts
        stts = struct.pack(">I", 0)
        stts += struct.pack(">I", 1)
        stts += struct.pack(">II", total_frames, 1)
        stbl_children += _write_box_raw(b"stts", stts)

        # stsc
        stsc = struct.pack(">I", 0)
        stsc += struct.pack(">I", 0)
        stbl_children += _write_box_raw(b"stsc", stsc)

        # stsz
        stsz = struct.pack(">I", 0)
        stsz += struct.pack(">I", 0)
        stsz += struct.pack(">I", 0)
        stbl_children += _write_box_raw(b"stsz", stsz)

        # stco
        stco = struct.pack(">I", 0)
        stco += struct.pack(">I", 0)
        stbl_children += _write_box_raw(b"stco", stco)

        minf_children += _write_box_raw(b"stbl", stbl_children)
        mdia_children += _write_box_raw(b"minf", minf_children)
        trak_children += _write_box_raw(b"mdia", mdia_children)
        moov_children += _write_box_raw(b"trak", trak_children)

        _write_box(f, b"moov", moov_children)
        _write_box(f, b"mdat", b"")


def _write_box_raw(box_type: bytes, data: bytes) -> bytes:
    import struct
    size = 8 + len(data)
    return struct.pack(">I", size) + box_type + data


def _write_box(f, box_type: bytes, data: bytes):
    import struct
    size = 8 + len(data)
    f.write(struct.pack(">I", size))
    f.write(box_type)
    f.write(data)
