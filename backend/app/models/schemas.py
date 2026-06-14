from pydantic import BaseModel, Field


class ErrorReportRequest(BaseModel):
    message: str
    context: dict = Field(default_factory=dict)
    user_actions: list[str] = Field(default_factory=list)


class TemplateCreateRequest(BaseModel):
    name: str = "Untitled"
    description: str = ""
    files: list[str] = Field(default_factory=list)
    author: str = "user"
    is_official: bool = False


class ApiKeyRequest(BaseModel):
    service: str
    key: str


class HealthResponse(BaseModel):
    status: str
    version: str


class PlatformResponse(BaseModel):
    platform: str
    is_docker: bool
    is_wsl: bool
    security_level: str
    process_isolation: bool
