import logging
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.defaults import IMAGE_BASE_URL, IMAGE_MODEL, IMAGE_SIZE

logger = logging.getLogger(__name__)
router = APIRouter()


class ImageGenerateRequest(BaseModel):
    prompt: str
    api_key: str
    model: str = IMAGE_MODEL
    base_url: str = IMAGE_BASE_URL
    size: str = IMAGE_SIZE
    ref_image_url: str | None = None


class ImageGenerateResponse(BaseModel):
    image_url: str


@router.post("/api/image/generate", response_model=ImageGenerateResponse)
async def generate_image(request: ImageGenerateRequest):
    """Generate an image using Agnes AI API (or compatible API)."""
    print(f"[image] START, prompt length: {len(request.prompt)}, model: {request.model}")
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            url = f"{request.base_url.rstrip('/')}/images/generations"
            logger.info(f"[image.generate] Calling {url} with model={request.model}, has_ref_image={bool(request.ref_image_url)}")

            payload = {
                "model": request.model,
                "prompt": request.prompt,
                "n": 1,
                "size": request.size,
            }

            if request.ref_image_url:
                payload["image"] = request.ref_image_url
                logger.info(f"[image.generate] Added ref_image_url to payload")

            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {request.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

            if response.status_code != 200 and request.ref_image_url:
                logger.warning(f"[image.generate] Request with ref_image failed ({response.status_code}), retrying without ref_image")
                payload.pop("image", None)
                response = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {request.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )

            response.raise_for_status()
            data = response.json()

            images = data.get("data", [])
            if not images:
                print(f"[image] ERROR: No image returned from API")
                raise HTTPException(status_code=500, detail="No image returned from API")

            image_url = images[0].get("url")
            if not image_url:
                print(f"[image] ERROR: No image URL in response")
                raise HTTPException(status_code=500, detail="No image URL in response")

            print(f"[image] SUCCESS")
            logger.info(f"[image.generate] Success, got image URL")
            return ImageGenerateResponse(image_url=image_url)

    except httpx.TimeoutException as e:
        print(f"[image] TIMEOUT: {str(e)}")
        raise HTTPException(status_code=504, detail=f"Image API timeout: {str(e)}")
    except httpx.HTTPStatusError as e:
        print(f"[image] HTTP ERROR: {e.response.status_code}")
        logger.error(f"[image.generate] API error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Image API error: {e.response.text}",
        )
    except httpx.RequestError as e:
        print(f"[image] CONNECTION ERROR: {str(e)}")
        logger.error(f"[image.generate] Connection error: {e}")
        raise HTTPException(status_code=503, detail=f"Connection error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[image] ERROR: {type(e).__name__}: {str(e)}")
        logger.error(f"[image.generate] Failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
