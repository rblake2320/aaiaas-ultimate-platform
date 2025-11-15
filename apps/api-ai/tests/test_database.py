"""
Tests for database module
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_database_connect():
    """Test database connection pool creation"""
    from database import Database

    db = Database()

    with patch('asyncpg.create_pool') as mock_create_pool:
        mock_pool = AsyncMock()
        mock_create_pool.return_value = mock_pool

        await db.connect()

        assert db.pool == mock_pool
        mock_create_pool.assert_called_once()


@pytest.mark.asyncio
async def test_database_disconnect():
    """Test database connection pool cleanup"""
    from database import Database

    db = Database()
    db.pool = AsyncMock()

    await db.disconnect()

    db.pool.close.assert_called_once()


@pytest.mark.asyncio
async def test_database_acquire():
    """Test acquiring connection from pool"""
    from database import Database

    db = Database()
    mock_pool = AsyncMock()
    mock_conn = MagicMock()

    # Mock the context manager
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    mock_pool.acquire.return_value.__aexit__.return_value = None

    db.pool = mock_pool

    async with db.acquire() as conn:
        assert conn == mock_conn


@pytest.mark.asyncio
async def test_database_acquire_without_pool():
    """Test that acquiring fails if pool not initialized"""
    from database import Database

    db = Database()

    with pytest.raises(RuntimeError) as exc_info:
        async with db.acquire() as conn:
            pass

    assert "not initialized" in str(exc_info.value)
