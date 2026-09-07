from uuid import UUID

from pydantic import BaseModel


class AuthenticatedUser(BaseModel):
    id: UUID
    # Authの未設定と、本人が明示した「トレーニー」を区別する。
    display_name: str | None


class User(BaseModel):
    id: UUID
    display_name: str
