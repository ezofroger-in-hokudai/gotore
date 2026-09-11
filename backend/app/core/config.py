from urllib.parse import urlsplit

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def is_header_token(value: str) -> bool:
    return bool(value) and all(33 <= ord(char) <= 126 and char not in "\"'" for char in value)


class Settings(BaseSettings):
    app_name: str = "GO TORE API"
    app_version: str = "0.1.0"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    database_url: str = ""
    database_pool_max_size: int = Field(default=4, ge=0, le=10)
    supabase_url: str = ""
    supabase_anon_key: str = ""
    openai_api_key: str = ""
    score_model: str = "gpt-5-nano"
    score_daily_limit: int = Field(default=30, ge=1, le=1000)
    goal_proposal_daily_limit: int = Field(default=10, ge=1, le=1000)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    def auth_configuration_error(self) -> str | None:
        # 起動自体は止めず、認証が必要なリクエストだけを拒否する。値は診断に含めない。
        if not is_header_token(self.supabase_url):
            return "SUPABASE_URL"
        try:
            url = urlsplit(self.supabase_url)
            if (
                url.scheme not in ("http", "https")
                or not url.hostname
                or url.username is not None
                or url.password is not None
                or url.query
                or url.fragment
                or url.port == 0
                or "\\" in self.supabase_url
            ):
                return "SUPABASE_URL"
        except ValueError:
            return "SUPABASE_URL"
        if not is_header_token(self.supabase_anon_key):
            return "SUPABASE_ANON_KEY"
        return None


settings = Settings()
