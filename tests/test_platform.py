import sys
from backend.app.core.platform import platform_detector, PlatformType

if sys.platform == "win32":
    import multiprocessing
    multiprocessing.freeze_support()


def test_platform_detection():
    assert platform_detector.platform in PlatformType
    assert isinstance(platform_detector.is_docker, bool)
    assert isinstance(platform_detector.is_wsl, bool)
    assert platform_detector.security_level in ("full", "degraded")


def test_platform_info():
    info = platform_detector.get_info()
    assert "platform" in info
    assert "security_level" in info
    assert "process_isolation" in info


def test_security_warning():
    warning = platform_detector.get_security_warning()
    if platform_detector.platform == PlatformType.WINDOWS and not platform_detector.is_docker:
        assert warning is not None
    else:
        assert warning is None
