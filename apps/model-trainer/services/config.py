from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    """
    Model-Trainer service settings.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Service
    port: int = Field(default=6000, alias="MODEL_TRAINER_PORT")
    cors_origin: str = Field(default="http://localhost:3000", alias="CORS_ORIGIN")

    # Paths
    scan_root: str = Field(default="/workspace", alias="MODEL_TRAINER_SCAN_ROOT")
    data_dir: str = Field(default="/workspace/apps/model-trainer/data", alias="MODEL_TRAINER_DATA_DIR")

    # Embeddings
    embedding_model: str = Field(default="sentence-transformers/all-MiniLM-L6-v2", alias="MODEL_TRAINER_EMBEDDING_MODEL")

    # Fine-tuning
    hf_token: str | None = Field(default=None, alias="HF_TOKEN")
    base_model: str = Field(default="distilgpt2", alias="MODEL_TRAINER_BASE_MODEL")

    # Scheduler
    scheduler_enabled: bool = Field(default=False, alias="MODEL_TRAINER_SCHEDULER_ENABLED")
    scheduler_interval_minutes: int = Field(default=60, alias="MODEL_TRAINER_SCHEDULER_INTERVAL_MINUTES")


settings = Settings()

