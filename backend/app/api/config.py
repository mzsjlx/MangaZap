from fastapi import APIRouter, HTTPException

from ..core.security import get_secure_executor

router = APIRouter()


@router.post("/api/config/api-key")
async def set_api_key(data: dict):
    service = data.get("service")
    key = data.get("key")
    api_base = data.get("api_base", "")
    model = data.get("model", "")
    if not service or not key:
        raise HTTPException(status_code=400, detail="Both 'service' and 'key' required")

    executor = get_secure_executor()
    executor.key_manager.set_key(service, key)
    if api_base:
        executor.key_manager.set_key(f"{service}_api_base", api_base)
    if model:
        executor.key_manager.set_key(f"{service}_model", model)
    return {"status": "ok", "service": service}


@router.get("/api/config/api-key/{service}")
async def check_api_key(service: str):
    executor = get_secure_executor()
    has_key = executor.key_manager.has_key(service)
    api_base = ""
    model = ""
    try:
        api_base = executor.key_manager.get_key(f"{service}_api_base")
    except Exception:
        pass
    try:
        model = executor.key_manager.get_key(f"{service}_model")
    except Exception:
        pass
    return {"service": service, "configured": has_key, "api_base": api_base, "model": model}


@router.delete("/api/config/api-key/{service}")
async def clear_api_key(service: str):
    executor = get_secure_executor()
    executor.key_manager.clear_key(service)
    executor.key_manager.clear_key(f"{service}_api_base")
    executor.key_manager.clear_key(f"{service}_model")
    return {"status": "cleared", "service": service}


@router.delete("/api/config/api-keys")
async def clear_all_api_keys():
    executor = get_secure_executor()
    executor.key_manager.clear_all_keys()
    return {"status": "all_cleared"}
