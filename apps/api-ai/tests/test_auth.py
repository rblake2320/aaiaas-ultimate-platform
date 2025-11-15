"""
Tests for authentication module
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch
import hashlib


def test_hash_api_key():
    """Test API key hashing function"""
    from auth import hash_api_key

    key = "test_api_key_123"
    hashed = hash_api_key(key)

    # Should return SHA-256 hash
    expected = hashlib.sha256(key.encode()).hexdigest()
    assert hashed == expected
    assert len(hashed) == 64  # SHA-256 produces 64 character hex string


@pytest.mark.asyncio
async def test_verify_api_key_no_auth_header():
    """Test API key verification fails without auth header"""
    from fastapi import HTTPException
    from auth import verify_api_key

    mock_conn = AsyncMock()

    with pytest.raises(HTTPException) as exc_info:
        await verify_api_key(authorization=None, conn=mock_conn)

    assert exc_info.value.status_code == 401
    assert "No authorization header" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_verify_api_key_invalid_format():
    """Test API key verification fails with invalid format"""
    from fastapi import HTTPException
    from auth import verify_api_key

    mock_conn = AsyncMock()

    with pytest.raises(HTTPException) as exc_info:
        await verify_api_key(authorization="InvalidFormat", conn=mock_conn)

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_verify_api_key_jwt_not_supported():
    """Test that JWT tokens are rejected (should use control API)"""
    from fastapi import HTTPException
    from auth import verify_api_key

    mock_conn = AsyncMock()

    with pytest.raises(HTTPException) as exc_info:
        await verify_api_key(authorization="Bearer jwt_token_here", conn=mock_conn)

    assert exc_info.value.status_code == 401
    assert "control API" in str(exc_info.value.detail).lower()


@pytest.mark.asyncio
async def test_verify_api_key_invalid_key():
    """Test API key verification fails with invalid key"""
    from fastapi import HTTPException
    from auth import verify_api_key

    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = None  # No matching key found

    with pytest.raises(HTTPException) as exc_info:
        await verify_api_key(authorization="ApiKey invalid_key_123", conn=mock_conn)

    assert exc_info.value.status_code == 401
    assert "Invalid API key" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_verify_api_key_success():
    """Test successful API key verification"""
    from auth import verify_api_key
    from datetime import datetime, timedelta

    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = {
        'id': 'key-123',
        'organization_id': 'org-456',
        'name': 'Test Key',
        'is_active': True,
        'expires_at': datetime.utcnow() + timedelta(days=30),
        'last_used_at': None,
        'org_id': 'org-456',
        'org_name': 'Test Org',
        'plan': 'pro',
        'org_status': 'active'
    }
    mock_conn.execute.return_value = None

    result = await verify_api_key(
        authorization="ApiKey test_key_123",
        conn=mock_conn
    )

    assert result['organization_id'] == 'org-456'
    assert result['organization_name'] == 'Test Org'
    assert result['plan'] == 'pro'
    assert result['api_key_name'] == 'Test Key'
