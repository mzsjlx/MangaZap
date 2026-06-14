import sys
import logging
from enum import Enum

logger = logging.getLogger(__name__)


class PlatformType(Enum):
    LINUX = "linux"
    MACOS = "macos"
    WINDOWS = "windows"
    WSL = "wsl"
    DOCKER = "docker"


class PlatformDetector:
    def __init__(self):
        self.platform = self._detect_platform()
        self.is_docker = self._detect_docker()
        self.is_wsl = self._detect_wsl()
        self.security_level = self._determine_security_level()

    def _detect_platform(self) -> PlatformType:
        if sys.platform == "linux":
            if self._is_wsl():
                return PlatformType.WSL
            return PlatformType.LINUX
        elif sys.platform == "darwin":
            return PlatformType.MACOS
        elif sys.platform == "win32":
            return PlatformType.WINDOWS
        else:
            return PlatformType.LINUX

    def _is_wsl(self) -> bool:
        try:
            with open("/proc/version", "r") as f:
                version = f.read().lower()
                return "microsoft" in version or "wsl" in version
        except Exception:
            return False

    def _detect_docker(self) -> bool:
        import os
        if os.path.exists("/.dockerenv"):
            return True
        try:
            with open("/proc/1/cgroup", "r") as f:
                return "docker" in f.read()
        except Exception:
            return False

    def _detect_wsl(self) -> bool:
        return self._is_wsl()

    def _determine_security_level(self) -> str:
        if self.is_docker:
            return "full"
        elif self.platform in (PlatformType.LINUX, PlatformType.WSL):
            return "full"
        elif self.platform == PlatformType.MACOS:
            return "full"
        elif self.platform == PlatformType.WINDOWS:
            return "degraded"
        else:
            return "degraded"

    def can_use_process_isolation(self) -> bool:
        return self.security_level == "full"

    def get_security_warning(self) -> str | None:
        if self.platform == PlatformType.WINDOWS and not self.is_docker:
            return (
                "Windows platform detected.\n"
                "Process isolation unavailable, degraded to thread mode.\n"
                "API keys may persist in memory.\n\n"
                "Recommended:\n"
                "1. WSL2: wsl --install\n"
                "2. Docker Desktop\n"
                "3. Linux/macOS native"
            )
        return None

    def print_startup_info(self):
        logger.info("Platform detection result:")
        logger.info(f"  OS: {self.platform.value}")
        logger.info(f"  Docker: {'yes' if self.is_docker else 'no'}")
        logger.info(f"  WSL: {'yes' if self.is_wsl else 'no'}")
        logger.info(f"  Security level: {self.security_level}")
        logger.info(f"  Process isolation: {'supported' if self.can_use_process_isolation() else 'degraded to thread mode'}")

        warning = self.get_security_warning()
        if warning:
            logger.warning(warning)

    def get_info(self) -> dict:
        return {
            "platform": self.platform.value,
            "is_docker": self.is_docker,
            "is_wsl": self.is_wsl,
            "security_level": self.security_level,
            "process_isolation": self.can_use_process_isolation(),
        }


platform_detector = PlatformDetector()
