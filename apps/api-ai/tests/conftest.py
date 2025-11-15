"""
Pytest configuration and fixtures for AI Services API tests
"""

import pytest
import asyncio
from typing import AsyncGenerator
from fastapi.testclient import TestClient
from httpx import AsyncClient
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def test_api_key():
    """Provide a test API key for authenticated requests"""
    return "test_key_12345"


@pytest.fixture
def test_org_context():
    """Provide test organization context"""
    return {
        "api_key_id": "test-key-id",
        "api_key_name": "Test API Key",
        "organization_id": "test-org-id",
        "organization_name": "Test Organization",
        "plan": "pro"
    }


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """
    Provide an async HTTP client for testing
    Note: Actual app import would require mocking database connections
    """
    # For now, return a basic client
    # In full implementation, import and test actual app
    async with AsyncClient(base_url="http://test") as client:
        yield client
