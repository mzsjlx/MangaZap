import os
import logging
import httpx
from pathlib import Path
from typing import AsyncGenerator
from app.core import defaults

logger = logging.getLogger(__name__)

IMAGE_API_PROVIDER = os.getenv("IMAGE_API_PROVIDER", "replicate")
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN", "")
REPLICATE_MODEL = os.getenv("REPLICATE_MODEL", "black-forest-labs/flux-schnell")
STABILITY_API_KEY = os.getenv("STABILITY_API_KEY", "")
STABILITY_MODEL = os.getenv("STABILITY_MODEL", "stable-diffusion-xl-1024-v1-0")


async def generate_images_stream(
    storyboard: dict,
    project_id: str,
    api_keys: dict | None = None,
) -> AsyncGenerator[dict, None]:
    yield {"step": "image", "message": "Preparing image generation...", "progress": 60}

    output_dir = Path(f"data/projects/{project_id}/images")
    output_dir.mkdir(parents=True, exist_ok=True)

    panels = storyboard.get("panels", [])
    image_paths = []

    agnes_key = (api_keys or {}).get("image_api_key") or os.getenv("AGNES_API_KEY", "")
    agnes_model = (api_keys or {}).get("image_model") or defaults.IMAGE_MODEL
    agnes_base_url = (api_keys or {}).get("image_base_url") or defaults.IMAGE_BASE_URL
    replicate_token = (api_keys or {}).get("image_api_key") or REPLICATE_API_TOKEN
    stability_key = (api_keys or {}).get("image_api_key") or STABILITY_API_KEY
    has_agnes = bool(agnes_key)
    has_replicate = bool(replicate_token)
    has_stability = bool(stability_key)

    if not has_agnes and not has_replicate and not has_stability:
        yield {
            "step": "missing_api",
            "api_type": "image",
            "message": "未配置图像生成 API（Agnes AI/Replicate/Stability AI），请提供 API 密钥后继续。",
        }
        yield {"step": "image", "message": "No image API configured, generating placeholders", "progress": 62}
        for i, panel in enumerate(panels):
            progress = 60 + int(30 * (i + 1) / len(panels))
            yield {"step": "image", "message": f"Creating placeholder {i + 1}/{len(panels)}: {panel['title']}", "progress": progress}
            image_path = _create_placeholder(output_dir, i, panel.get("title", f"Scene {i+1}"))
            image_paths.append(str(image_path))
        yield {"step": "image", "message": f"All {len(image_paths)} placeholders generated", "progress": 90, "data": {"image_paths": image_paths}}
        return

    if has_agnes:
        provider = "agnes"
    elif has_replicate:
        provider = "replicate"
    else:
        provider = "stability"
    yield {"step": "image", "message": f"Using {provider} API for image generation", "progress": 62}

    for i, panel in enumerate(panels):
        progress = 60 + int(30 * (i + 1) / len(panels))
        yield {"step": "image", "message": f"Generating image {i + 1}/{len(panels)}: {panel['title']}", "progress": progress}

        image_path = output_dir / f"scene_{i + 1:03d}.png"

        for attempt in range(3):
            try:
                if provider == "agnes":
                    await _generate_with_agnes(panel["prompt"], image_path, agnes_key, agnes_model, agnes_base_url)
                elif provider == "replicate":
                    await _generate_with_replicate(panel["prompt"], image_path, replicate_token)
                else:
                    await _generate_with_stability(panel["prompt"], image_path, stability_key)
                image_paths.append(str(image_path))
                yield {"step": "image", "message": f"Image {i + 1} generated", "progress": progress}
                break
            except Exception as e:
                logger.warning(f"Image gen attempt {attempt + 1} failed: {e}")
                if attempt < 2:
                    yield {"step": "image", "message": f"Retry {attempt + 2}/3 for image {i + 1}...", "progress": progress}
                else:
                    yield {"step": "image", "message": f"Failed image {i + 1}, using placeholder", "progress": progress}
                    image_path = _create_placeholder(output_dir, i, panel.get("title", f"Scene {i+1}"))
                    image_paths.append(str(image_path))

    yield {"step": "image", "message": f"All {len(image_paths)} images generated", "progress": 90, "data": {"image_paths": image_paths}}


async def _generate_with_replicate(prompt: str, output_path: Path, api_key: str):
    async with httpx.AsyncClient(timeout=120.0) as client:
        create_resp = await client.post(
            "https://api.replicate.com/v1/predictions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "version": REPLICATE_MODEL.split("/")[-1] if ":" in REPLICATE_MODEL else REPLICATE_MODEL,
                "input": {
                    "prompt": prompt,
                    "num_outputs": 1,
                    "aspect_ratio": "16:9",
                },
            },
        )
        create_resp.raise_for_status()
        prediction = create_resp.json()

        prediction_id = prediction["id"]
        status = prediction["status"]

        for _ in range(60):
            if status in ("succeeded", "failed"):
                break

            poll_resp = await client.get(
                f"https://api.replicate.com/v1/predictions/{prediction_id}",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            poll_resp.raise_for_status()
            prediction = poll_resp.json()
            status = prediction["status"]

            import asyncio
            await asyncio.sleep(2)

        if status != "succeeded":
            raise RuntimeError(f"Replicate prediction failed: {status}")

        output = prediction.get("output", [])
        if not output:
            raise RuntimeError("No output from Replicate")

        image_url = output[0] if isinstance(output, list) else output

        img_resp = await client.get(image_url)
        img_resp.raise_for_status()

        with open(output_path, "wb") as f:
            f.write(img_resp.content)


async def _generate_with_agnes(
    prompt: str,
    output_path: Path,
    api_key: str,
    model: str | None = None,
    base_url: str | None = None,
):
    """Generate image using Agnes AI API (or compatible OpenAI-format API)."""
    model = model or defaults.IMAGE_MODEL
    base_url = base_url or defaults.IMAGE_BASE_URL
    async with httpx.AsyncClient(timeout=120.0) as client:
        url = f"{base_url.rstrip('/')}/images/generations"
        response = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "prompt": prompt,
                "n": 1,
                "size": "1024x1024",
            },
        )
        response.raise_for_status()
        data = response.json()

        images = data.get("data", [])
        if not images:
            raise RuntimeError("No image returned from Agnes AI")

        image_url = images[0].get("url")
        if not image_url:
            raise RuntimeError("No image URL in Agnes AI response")

        img_resp = await client.get(image_url)
        img_resp.raise_for_status()

        with open(output_path, "wb") as f:
            f.write(img_resp.content)


async def _generate_with_stability(prompt: str, output_path: Path, api_key: str):
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"https://api.stability.ai/v1/generation/{STABILITY_MODEL}/text-to-image",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json={
                "text_prompts": [{"text": prompt, "weight": 1.0}],
                "cfg_scale": 7,
                "height": 1080,
                "width": 1920,
                "samples": 1,
                "steps": 30,
            },
        )
        response.raise_for_status()
        data = response.json()

        import base64
        for artifact in data.get("artifacts", []):
            if artifact.get("finishReason") == "SUCCESS":
                img_bytes = base64.b64decode(artifact["base64"])
                with open(output_path, "wb") as f:
                    f.write(img_bytes)
                return

        raise RuntimeError("No successful image from Stability AI")


def _create_placeholder(output_dir: Path, index: int, text: str) -> Path:
    image_path = output_dir / f"scene_{index + 1:03d}.png"
    try:
        from PIL import Image, ImageDraw, ImageFont
        import random

        W, H = 1920, 1080

        palettes = [
            {"bg1": (15, 15, 35), "bg2": (60, 20, 80), "accent": (255, 100, 150), "text": (220, 220, 255)},
            {"bg1": (20, 30, 60), "bg2": (10, 60, 90), "accent": (100, 200, 255), "text": (200, 230, 255)},
            {"bg1": (40, 15, 15), "bg2": (80, 30, 20), "accent": (255, 180, 80), "text": (255, 220, 200)},
            {"bg1": (15, 35, 20), "bg2": (20, 70, 40), "accent": (100, 255, 150), "text": (200, 255, 220)},
            {"bg1": (30, 15, 45), "bg2": (70, 20, 60), "accent": (200, 100, 255), "text": (230, 200, 255)},
            {"bg1": (50, 30, 10), "bg2": (90, 50, 15), "accent": (255, 200, 50), "text": (255, 240, 200)},
        ]
        pal = palettes[index % len(palettes)]

        img = Image.new("RGB", (W, H), color=pal["bg1"])
        draw = ImageDraw.Draw(img)

        # Gradient background (vertical)
        for y in range(H):
            r = int(pal["bg1"][0] + (pal["bg2"][0] - pal["bg1"][0]) * y / H)
            g = int(pal["bg1"][1] + (pal["bg2"][1] - pal["bg1"][1]) * y / H)
            b = int(pal["bg1"][2] + (pal["bg2"][2] - pal["bg1"][2]) * y / H)
            draw.line([(0, y), (W, y)], fill=(r, g, b))

        # Decorative circles (manga panel style)
        rng = random.Random(index * 42)
        for _ in range(8):
            cx = rng.randint(-200, W + 200)
            cy = rng.randint(-200, H + 200)
            radius = rng.randint(100, 400)
            overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            overlay_draw = ImageDraw.Draw(overlay)
            alpha = rng.randint(8, 25)
            overlay_draw.ellipse(
                [cx - radius, cy - radius, cx + radius, cy + radius],
                fill=(*pal["accent"], alpha),
            )
            img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
            draw = ImageDraw.Draw(img)

        # Diagonal speed lines (manga style)
        for _ in range(15):
            x1 = rng.randint(-500, W)
            y1 = rng.randint(0, H)
            x2 = x1 + rng.randint(300, 800)
            y2 = y1 + rng.randint(-200, 200)
            alpha_val = rng.randint(15, 40)
            line_color = (*pal["accent"][:3],)
            draw.line([(x1, y1), (x2, y2)], fill=line_color, width=1)

        # Central panel border (manga frame)
        panel_x, panel_y = 140, 100
        panel_w, panel_h = W - 280, H - 200
        border_width = 4
        draw.rectangle(
            [panel_x, panel_y, panel_x + panel_w, panel_y + panel_h],
            outline=pal["accent"], width=border_width
        )
        # Inner border glow
        draw.rectangle(
            [panel_x + 8, panel_y + 8, panel_x + panel_w - 8, panel_y + panel_h - 8],
            outline=(*pal["accent"][:3],), width=1
        )

        # Decorative corner brackets
        corner_size = 40
        for cx, cy in [(panel_x + 15, panel_y + 15), (panel_x + panel_w - 15, panel_y + 15),
                        (panel_x + 15, panel_y + panel_h - 15), (panel_x + panel_w - 15, panel_y + panel_h - 15)]:
            draw.line([(cx - corner_size, cy), (cx + corner_size, cy)], fill=pal["accent"], width=2)
            draw.line([(cx, cy - corner_size), (cx, cy + corner_size)], fill=pal["accent"], width=2)

        # Horizontal rule lines (manga narration style)
        for ly in [panel_y + 60, panel_y + panel_h - 60]:
            draw.line([(panel_x + 40, ly), (panel_x + panel_w - 40, ly)], fill=pal["accent"], width=1)

        # Scene title font
        try:
            font_title = ImageFont.truetype("arial.ttf", 72)
            font_sub = ImageFont.truetype("arial.ttf", 40)
            font_label = ImageFont.truetype("arial.ttf", 28)
        except Exception:
            font_title = ImageFont.load_default()
            font_sub = ImageFont.load_default()
            font_label = ImageFont.load_default()

        # Scene number badge
        badge_text = f"Scene {index + 1}"
        badge_bbox = draw.textbbox((0, 0), badge_text, font=font_label)
        badge_w = badge_bbox[2] - badge_bbox[0] + 20
        badge_h = badge_bbox[3] - badge_bbox[1] + 10
        badge_x = panel_x + 20
        badge_y = panel_y + 20
        draw.rectangle([badge_x, badge_y, badge_x + badge_w, badge_y + badge_h], fill=pal["accent"])
        draw.text((badge_x + 10, badge_y + 2), badge_text, fill=pal["bg1"], font=font_label)

        # Main title
        title_bbox = draw.textbbox((0, 0), text, font=font_title)
        title_w = title_bbox[2] - title_bbox[0]
        title_x = (W - title_w) // 2
        title_y = (H - (title_bbox[3] - title_bbox[1])) // 2 - 30
        # Shadow
        draw.text((title_x + 3, title_y + 3), text, fill=(0, 0, 0), font=font_title)
        draw.text((title_x, title_y), text, fill=pal["text"], font=font_title)

        # Subtitle line
        subtitle = "~ MangaZap ~"
        sub_bbox = draw.textbbox((0, 0), subtitle, font=font_sub)
        sub_w = sub_bbox[2] - sub_bbox[0]
        draw.text(((W - sub_w) // 2, title_y + 100), subtitle, fill=pal["accent"], font=font_sub)

        # Decorative dots pattern at bottom
        for dx in range(0, W, 30):
            for dy_offset in [0, 15]:
                dot_y = panel_y + panel_h - 30 + dy_offset
                if rng.random() > 0.5:
                    draw.ellipse([dx - 2, dot_y - 2, dx + 2, dot_y + 2], fill=pal["accent"])

        img.save(str(image_path))
    except ImportError:
        import struct
        png_header = b"\x89PNG\r\n\x1a\n"
        ihdr_data = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
        ihdr_crc = b"\x00" * 4
        ihdr = b"\x00\x00\x00\x0dIHDR" + ihdr_data + ihdr_crc
        idat = b"\x00\x00\x00\x01IDATx\x00\x00\x00\x02\x00\x01"
        iend = b"\x00\x00\x00\x00IEND\xaeB`\x82"
        with open(image_path, "wb") as f:
            f.write(png_header + ihdr + idat + iend)

    return image_path
