from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database (direct/unpooled connection for writes)
    database_url: str = Field(..., alias="DATABASE_URL")

    # Auth secret shared with Next.js frontend
    backend_secret: str = Field(..., alias="BACKEND_SECRET")

    # OpenAI
    openai_api_key: str = Field(..., alias="OPENAI_API_KEY")

    # Cloudflare R2 / Backblaze B2 storage
    r2_endpoint: str = Field(..., alias="CLOUDFLARE_R2_ENDPOINT")
    r2_access_key_id: str = Field(..., alias="CLOUDFLARE_R2_ACCESS_KEY_ID")
    r2_secret_access_key: str = Field(..., alias="CLOUDFLARE_R2_SECRET_ACCESS_KEY")
    r2_bucket_name: str = Field(..., alias="CLOUDFLARE_R2_BUCKET_NAME")
    r2_region: str = Field("auto", alias="CLOUDFLARE_R2_REGION")

    # Model constants
    embed_model: str = "nomic-embed-text"
    embed_dimensions: int = 768
    embed_batch_size: int = 15  # OpenAI rate-limit safe default

    # Chunking defaults (can be overridden per-document)
    default_chunk_size: int = 512      # tokens
    default_chunk_overlap: int = 64    # tokens

    # Ingestion concurrency
    max_concurrent_ingestions: int = 4


settings = Settings()
