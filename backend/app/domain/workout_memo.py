from pydantic import BaseModel, ConfigDict, Field


class WorkoutMemoInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(max_length=1000)
    expected_revision: int = Field(ge=0, strict=True)
