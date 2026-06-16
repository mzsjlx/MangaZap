import os
import json
import sys
import logging
from typing import Callable, Any
from concurrent.futures import ThreadPoolExecutor
from .platform import platform_detector
from . import defaults

logger = logging.getLogger(__name__)


class SecureApiKeyManager:
    def __init__(self, key_file: str = "data/.keys.enc"):
        self._key_file = key_file
        self._encrypted_keys: dict[str, str] = {}
        self._load_keys_from_file()

    def _load_keys_from_file(self):
        if os.path.exists(self._key_file):
            try:
                with open(self._key_file, "r") as f:
                    self._encrypted_keys = json.load(f)
            except Exception:
                self._encrypted_keys = {}

    def _save_keys_to_file(self):
        os.makedirs(os.path.dirname(self._key_file), exist_ok=True)
        with open(self._key_file, "w") as f:
            json.dump(self._encrypted_keys, f)

    def set_key(self, service: str, key: str) -> None:
        encoded = key.encode("utf-8")
        obfuscated = bytes([b ^ 0x5A for b in encoded])
        self._encrypted_keys[service] = obfuscated.hex()
        self._save_keys_to_file()

    def get_key(self, service: str) -> str:
        hex_data = self._encrypted_keys.get(service)
        if not hex_data:
            raise ValueError(f"API key '{service}' not configured")
        obfuscated = bytes.fromhex(hex_data)
        key = bytes([b ^ 0x5A for b in obfuscated]).decode("utf-8")
        return key

    def has_key(self, service: str) -> bool:
        return service in self._encrypted_keys

    def clear_key(self, service: str) -> None:
        if service in self._encrypted_keys:
            del self._encrypted_keys[service]
            self._save_keys_to_file()

    def clear_all_keys(self) -> None:
        self._encrypted_keys.clear()
        self._save_keys_to_file()


class SecureExecutor:
    def __init__(self, api_key_manager: SecureApiKeyManager):
        self.key_manager = api_key_manager
        self.use_process_isolation = platform_detector.can_use_process_isolation()
        self._thread_pool: ThreadPoolExecutor | None = None

        platform_detector.print_startup_info()

        if not self.use_process_isolation:
            logger.warning("Degraded to thread mode, API keys may persist in memory")
            self._thread_pool = ThreadPoolExecutor(max_workers=4)

    def execute(self, func: Callable, *args, **kwargs) -> Any:
        if self.use_process_isolation:
            return self._execute_in_process(func, *args, **kwargs)
        else:
            return self._execute_in_thread(func, *args, **kwargs)

    def _execute_in_process(self, func: Callable, *args, **kwargs) -> Any:
        import multiprocessing

        if sys.platform == "win32":
            multiprocessing.freeze_support()

        def worker(fn, *a, **kw):
            return fn(*a, **kw)

        with multiprocessing.Pool(processes=1) as pool:
            result = pool.apply(worker, (func,) + args, kwargs)
        return result

    def _execute_in_thread(self, func: Callable, *args, **kwargs) -> Any:
        logger.debug("Executing task in thread mode (key may persist)")
        future = self._thread_pool.submit(func, *args, **kwargs)
        return future.result()

    def execute_llm_task(self, prompt: str, model: str = "mimo") -> str:
        def llm_worker(prompt: str, model: str, api_key: str) -> str:
            import httpx

            response = httpx.post(
                f"{defaults.CHAT_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            return response.json()["choices"][0]["message"]["content"]

        api_key = self.key_manager.get_key("mimo")
        return self.execute(llm_worker, prompt, model, api_key)

    def shutdown(self):
        if self._thread_pool:
            self._thread_pool.shutdown(wait=False)


_secure_executor: SecureExecutor | None = None


def get_secure_executor() -> SecureExecutor:
    global _secure_executor
    if _secure_executor is None:
        _secure_executor = SecureExecutor(SecureApiKeyManager())
    return _secure_executor
