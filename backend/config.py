from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database (direct/unpooled connection for writes)
    database_url: str = Field(..., alias="DATABASE_URL")

    # Auth secret shared with Next.js frontend
    backend_secret: str = Field(..., alias="BACKEND_SECRET")

    # OpenAI (used if OPENROUTER_API_KEY is not set)
    openai_api_key: str = Field("", alias="OPENAI_API_KEY")

    # OpenRouter — preferred for chat/distillation (free tier, picks best model)
    # If set, all LLM calls use OpenRouter instead of OpenAI directly.
    openrouter_api_key: str = Field("", alias="OPENROUTER_API_KEY")

    # Cloudflare R2 / Backblaze B2 storage
    r2_endpoint: str = Field(..., alias="CLOUDFLARE_R2_ENDPOINT")
    r2_access_key_id: str = Field(..., alias="CLOUDFLARE_R2_ACCESS_KEY_ID")
    r2_secret_access_key: str = Field(..., alias="CLOUDFLARE_R2_SECRET_ACCESS_KEY")
    r2_bucket_name: str = Field(..., alias="CLOUDFLARE_R2_BUCKET_NAME")
    r2_region: str = Field("auto", alias="CLOUDFLARE_R2_REGION")

    # Model constants
    embed_model: str = "nomic-embed-text"
    embed_dimensions: int = 768
    embed_batch_size: int = 15

    # Chunking defaults (can be overridden per-document)
    default_chunk_size: int = 512      # tokens
    default_chunk_overlap: int = 64    # tokens

    # Ingestion concurrency
    max_concurrent_ingestions: int = 4

    # ── HERALD — Distillation settings ────────────────────────────────────────
    herald_enabled: bool = Field(True, alias="HERALD_ENABLED")
    # Max chunks sampled per document for distillation (cost control)
    herald_distill_max_chunks: int = Field(30, alias="HERALD_DISTILL_MAX_CHUNKS")
    # Retrieval count threshold before a chunk is promoted to a KG node
    herald_promotion_threshold: int = Field(3, alias="HERALD_PROMOTION_THRESHOLD")
    # pg_trgm similarity threshold for KG node title deduplication
    herald_dedup_similarity: float = Field(0.7, alias="HERALD_DEDUP_SIMILARITY")
    # Whether to run contradiction detection on new nodes vs existing
    herald_contradiction_check: bool = Field(True, alias="HERALD_CONTRADICTION_CHECK")
    # How often the promoter job runs (minutes)
    herald_promoter_interval_minutes: int = Field(60, alias="HERALD_PROMOTER_INTERVAL")

    @property
    def llm_api_key(self) -> str:
        """Return the active LLM API key — OpenRouter preferred, OpenAI fallback."""
        return self.openrouter_api_key or self.openai_api_key

    @property
    def llm_base_url(self) -> str | None:
        """Return OpenRouter base URL if configured, else None (OpenAI default)."""
        return "https://openrouter.ai/api/v1" if self.openrouter_api_key else None

    @property
    def llm_model(self) -> str:
        """Auto model via OpenRouter (free, picks best available); OpenAI fallback."""
        return "openrouter/auto" if self.openrouter_api_key else "gpt-4o-mini"


settings = Settings()
