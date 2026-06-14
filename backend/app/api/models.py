import logging
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()


class ModelsRequest(BaseModel):
    api_key: str
    base_url: str


@router.post("/api/models")
async def list_models(request: ModelsRequest):
    """Fetch available models from an OpenAI-compatible API provider."""
    url = f"{request.base_url.rstrip('/')}/models"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {request.api_key}",
                    "Accept": "application/json",
                },
            )

            if response.status_code == 401:
                raise HTTPException(status_code=401, detail="API Key 无效")
            if response.status_code == 403:
                raise HTTPException(status_code=403, detail="API Key 权限不足")

            response.raise_for_status()
            data = response.json()

            # OpenAI format: {"data": [{"id": "model-name", ...}, ...]}
            raw_models = data.get("data", [])

            models = []
            for m in raw_models:
                model_id = m.get("id", "")
                if model_id:
                    models.append({
                        "id": model_id,
                        "owned_by": m.get("owned_by", ""),
                    })

            # Sort by id
            models.sort(key=lambda x: x["id"])

            return {"models": models}

    except httpx.TimeoutException:
        logger.warning(f"Timeout fetching models from {url}")
        raise HTTPException(status_code=504, detail="请求超时，请检查 Base URL 是否正确")
    except httpx.ConnectError:
        logger.warning(f"Connection failed to {url}")
        raise HTTPException(status_code=502, detail="无法连接到 API 服务器")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to fetch models from {url}")
        raise HTTPException(status_code=500, detail=f"获取模型列表失败: {str(e)}")
