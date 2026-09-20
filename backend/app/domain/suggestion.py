from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SuggestionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    content: str = Field(min_length=1, max_length=2000)

    @field_validator("content", mode="before")
    @classmethod
    def strip_content(cls, value):
        return value.strip() if isinstance(value, str) else value


class SuggestionLimitReached(Exception):
    pass
