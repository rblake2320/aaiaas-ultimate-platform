"""
Authentication and authorization for AI Services API
"""

from fastapi import HTTPException, Header, Depends
from typing import Optional
import asyncpg
import hashlib
import logging
from datetime import datetime
from database import get_db

logger = logging.getLogger(__name__)


def hash_api_key(key: str) -> str:
    """
    Hash API key using SHA-256 (same as Node.js implementation)
    """
    return hashlib.sha256(key.encode()).hexdigest()


async def verify_api_key(
    authorization: Optional[str] = Header(None),
    conn: asyncpg.Connection = Depends(get_db)
) -> dict:
    """
    Verify API key and return organization context

    Args:
        authorization: Authorization header value (Bearer <token> or ApiKey <key>)
        conn: Database connection from dependency

    Returns:
        dict: Organization context with id, name, and plan

    Raises:
        HTTPException: If authentication fails
    """
    if not authorization:
        logger.warning("No authorization header provided")
        raise HTTPException(status_code=401, detail="No authorization header")

    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0] not in ["Bearer", "ApiKey"]:
        logger.warning(f"Invalid authorization format: {authorization[:20]}...")
        raise HTTPException(status_code=401, detail="Invalid authorization format")

    auth_type, token = parts

    if auth_type == "Bearer":
        # JWT token authentication (from frontend)
        # For now, we accept JWT tokens but don't validate them deeply
        # The control API should handle JWT validation
        # This is primarily for API key authentication
        logger.info("JWT token authentication - deferring to control API")
        raise HTTPException(
            status_code=401,
            detail="JWT authentication should be handled by control API. Use ApiKey for direct API access."
        )

    elif auth_type == "ApiKey":
        # API key authentication (programmatic access)
        try:
            # Hash the provided key
            key_hash = hash_api_key(token)

            # Query database for API key
            api_key_record = await conn.fetchrow(
                """
                SELECT
                    ak.id,
                    ak.organization_id,
                    ak.name,
                    ak.is_active,
                    ak.expires_at,
                    ak.last_used_at,
                    o.id as org_id,
                    o.name as org_name,
                    o.plan,
                    o.status as org_status
                FROM api_keys ak
                JOIN organizations o ON o.id = ak.organization_id
                WHERE ak.key_hash = $1
                """,
                key_hash
            )

            if not api_key_record:
                logger.warning(f"Invalid API key attempt: {token[:10]}...")
                raise HTTPException(status_code=401, detail="Invalid API key")

            # Check if key is active
            if not api_key_record['is_active']:
                logger.warning(f"Inactive API key used: {api_key_record['name']}")
                raise HTTPException(status_code=401, detail="API key is inactive")

            # Check if key is expired
            if api_key_record['expires_at']:
                expires_at = api_key_record['expires_at']
                if isinstance(expires_at, str):
                    from dateutil import parser as date_parser
                    expires_at = date_parser.parse(expires_at)

                if expires_at < datetime.utcnow():
                    logger.warning(f"Expired API key used: {api_key_record['name']}")
                    raise HTTPException(status_code=401, detail="API key has expired")

            # Check organization status
            if api_key_record['org_status'] != 'active':
                logger.warning(
                    f"API key from non-active organization: {api_key_record['org_name']} "
                    f"(status: {api_key_record['org_status']})"
                )
                raise HTTPException(
                    status_code=403,
                    detail=f"Organization is {api_key_record['org_status']}"
                )

            # Update last_used_at timestamp (fire and forget)
            try:
                await conn.execute(
                    "UPDATE api_keys SET last_used_at = $1 WHERE id = $2",
                    datetime.utcnow(),
                    api_key_record['id']
                )
            except Exception as e:
                # Don't fail auth if we can't update timestamp
                logger.error(f"Failed to update API key last_used_at: {str(e)}")

            # Return organization context
            org_context = {
                "api_key_id": str(api_key_record['id']),
                "api_key_name": api_key_record['name'],
                "organization_id": str(api_key_record['organization_id']),
                "organization_name": api_key_record['org_name'],
                "plan": api_key_record['plan']
            }

            logger.info(
                f"Authenticated API key '{api_key_record['name']}' "
                f"for org '{api_key_record['org_name']}'"
            )

            return org_context

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"API key validation error: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    else:
        raise HTTPException(status_code=401, detail="Unsupported authorization type")
