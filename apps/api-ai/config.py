"""
Configuration and environment validation for AI Services API
"""

import os
from typing import Optional
from pydantic import BaseSettings, Field, validator


class Settings(BaseSettings):
    """
    Application settings with validation
    """
    
    # Application
    app_name: str = "aaIaaS AI Services"
    environment: str = Field(default="development", env="NODE_ENV")
    debug: bool = Field(default=False)
    
    # API Configuration
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=5000)
    api_prefix: str = "/api/v1"
    
    # Database
    database_url: str = Field(..., env="DATABASE_URL")
    
    # Redis
    redis_url: str = Field(default="redis://localhost:6379", env="REDIS_URL")
    redis_password: Optional[str] = Field(default=None, env="REDIS_PASSWORD")
    
    # OpenAI
    openai_api_key: str = Field(..., env="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4.1-mini")
    
    # Security
    api_key_header: str = "Authorization"
    allowed_origins: list[str] = Field(default=["http://localhost:3000"])
    
    # Rate Limiting
    rate_limit_enabled: bool = True
    rate_limit_requests: int = 100
    rate_limit_window: int = 60  # seconds
    
    # OCR Configuration
    ocr_model: str = "deepseek-ai/DeepSeek-OCR"
    ocr_default_resolution: int = 1024
    ocr_max_batch_size: int = 100
    ocr_max_file_size: int = 10 * 1024 * 1024  # 10MB
    
    # RAG Configuration
    rag_chunk_size: int = 500
    rag_chunk_overlap: int = 50
    rag_top_k: int = 3
    
    # Agent Configuration
    agent_max_iterations: int = 10
    agent_timeout: int = 300  # seconds
    
    # Logging
    log_level: str = Field(default="INFO", env="LOG_LEVEL")
    
    @validator("openai_api_key")
    def validate_openai_key(cls, v):
        """Validate OpenAI API key format"""
        if not v or v.startswith("your-") or v.startswith("sk-your"):
            raise ValueError(
                "Invalid OpenAI API key. Please set a valid OPENAI_API_KEY environment variable. "
                "Get your key from: https://platform.openai.com/api-keys"
            )
        if not v.startswith("sk-"):
            raise ValueError("OpenAI API key must start with 'sk-'")
        return v
    
    @validator("database_url")
    def validate_database_url(cls, v):
        """Validate database URL format"""
        if not v or "your-" in v or "localhost" not in v and "example" in v:
            raise ValueError(
                "Invalid DATABASE_URL. Please set a valid PostgreSQL connection string. "
                "Format: postgresql://user:password@host:port/database"
            )
        if not v.startswith("postgresql://") and not v.startswith("postgres://"):
            raise ValueError("DATABASE_URL must start with 'postgresql://' or 'postgres://'")
        return v
    
    @validator("environment")
    def validate_environment(cls, v):
        """Validate environment value"""
        valid_envs = ["development", "staging", "production", "test"]
        if v not in valid_envs:
            raise ValueError(f"Environment must be one of: {', '.join(valid_envs)}")
        return v
    
    @validator("allowed_origins")
    def validate_origins(cls, v):
        """Parse CORS origins from environment"""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# Global settings instance
try:
    settings = Settings()
except Exception as e:
    print(f"❌ Configuration Error: {str(e)}")
    print("\n📝 Please check your .env file and ensure all required variables are set.")
    print("   Copy .env.example to .env and fill in the values.\n")
    raise


# Export for easy import
__all__ = ["settings"]

