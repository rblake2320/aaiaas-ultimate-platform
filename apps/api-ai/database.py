"""
Database connection and utilities for AI Services API
"""

import asyncpg
import logging
from typing import Optional
from contextlib import asynccontextmanager
from config import settings

logger = logging.getLogger(__name__)


class Database:
    """Async PostgreSQL database connection manager"""

    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        """Initialize database connection pool"""
        try:
            self.pool = await asyncpg.create_pool(
                settings.database_url,
                min_size=2,
                max_size=10,
                command_timeout=60
            )
            logger.info("Database connection pool created")
        except Exception as e:
            logger.error(f"Failed to connect to database: {str(e)}")
            raise

    async def disconnect(self):
        """Close database connection pool"""
        if self.pool:
            await self.pool.close()
            logger.info("Database connection pool closed")

    @asynccontextmanager
    async def acquire(self):
        """Acquire a connection from the pool"""
        if not self.pool:
            raise RuntimeError("Database pool not initialized. Call connect() first.")

        async with self.pool.acquire() as connection:
            yield connection


# Global database instance
db = Database()


async def get_db():
    """Dependency for FastAPI to get database connection"""
    async with db.acquire() as conn:
        yield conn
