# API Testing Guide

This guide provides examples for testing all API endpoints.

## Authentication Endpoints

### Register a New User

```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "name": "John Doe",
    "organizationName": "Acme Inc"
  }'
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "organization": {
    "id": "uuid",
    "name": "Acme Inc",
    "slug": "acme-inc-abc123"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Login

```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "organization": {
    "id": "uuid",
    "name": "Acme Inc",
    "slug": "acme-inc-abc123",
    "plan": "free"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Refresh Access Token

```bash
curl -X POST http://localhost:4000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }'
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Get Current User

```bash
curl -X GET http://localhost:4000/api/v1/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "organizationId": "uuid",
    "role": "owner"
  },
  "organization": {
    "id": "uuid",
    "name": "Acme Inc",
    "plan": "free"
  }
}
```

### Logout

```bash
curl -X POST http://localhost:4000/api/v1/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }'
```

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

## AI Services Endpoints

### Chat Completion

```bash
curl -X POST http://localhost:5000/api/v1/chat \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "What is artificial intelligence?"
      }
    ],
    "model": "gpt-4.1-mini",
    "temperature": 0.7
  }'
```

**Response:**
```json
{
  "id": "chatcmpl-abc123",
  "model": "gpt-4.1-mini",
  "message": {
    "role": "assistant",
    "content": "Artificial intelligence (AI) is..."
  },
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 150,
    "total_tokens": 165
  },
  "created_at": "2024-01-01T12:00:00Z"
}
```

### Text Completion

```bash
curl -X POST http://localhost:5000/api/v1/completions \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a haiku about programming:",
    "model": "gpt-4.1-mini",
    "temperature": 0.8,
    "max_tokens": 50
  }'
```

**Response:**
```json
{
  "id": "cmpl-abc123",
  "model": "gpt-4.1-mini",
  "text": "Code flows like water\nBugs hide in silent shadows\nDebug brings the light",
  "usage": {
    "prompt_tokens": 8,
    "completion_tokens": 20,
    "total_tokens": 28
  },
  "created_at": "2024-01-01T12:00:00Z"
}
```

### Create Embeddings

```bash
curl -X POST http://localhost:5000/api/v1/embeddings \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Hello, world!",
    "model": "text-embedding-ada-002"
  }'
```

**Response:**
```json
{
  "embeddings": [
    [0.0023, -0.0091, 0.0045, ...]
  ],
  "model": "text-embedding-ada-002",
  "usage": {
    "prompt_tokens": 3,
    "total_tokens": 3
  }
}
```

### Create Embeddings (Batch)

```bash
curl -X POST http://localhost:5000/api/v1/embeddings \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "input": [
      "First document",
      "Second document",
      "Third document"
    ],
    "model": "text-embedding-ada-002"
  }'
```

**Response:**
```json
{
  "embeddings": [
    [0.0023, -0.0091, ...],
    [0.0034, -0.0082, ...],
    [0.0012, -0.0095, ...]
  ],
  "model": "text-embedding-ada-002",
  "usage": {
    "prompt_tokens": 6,
    "total_tokens": 6
  }
}
```

## Health Check Endpoints

### Control API Health

```bash
curl http://localhost:4000/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00Z",
  "service": "api-control"
}
```

### AI API Health

```bash
curl http://localhost:5000/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00Z",
  "service": "api-ai"
}
```

## Error Responses

### 400 Bad Request

```json
{
  "error": "Validation error",
  "details": [
    {
      "path": "email",
      "message": "Invalid email"
    }
  ]
}
```

### 401 Unauthorized

```json
{
  "error": "Invalid or expired token"
}
```

### 403 Forbidden

```json
{
  "error": "Insufficient permissions"
}
```

### 404 Not Found

```json
{
  "error": "Route not found",
  "path": "/api/v1/invalid"
}
```

### 409 Conflict

```json
{
  "error": "User already exists"
}
```

### 429 Too Many Requests

```json
{
  "error": "Rate limit exceeded",
  "resetAt": "2024-01-01T12:05:00Z"
}
```

### 500 Internal Server Error

```json
{
  "error": "Internal server error"
}
```

## Testing with Postman

### Import Collection

Create a Postman collection with the following structure:

```json
{
  "info": {
    "name": "aaIaaS.ai API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:4000"
    },
    {
      "key": "aiBaseUrl",
      "value": "http://localhost:5000"
    },
    {
      "key": "accessToken",
      "value": ""
    }
  ]
}
```

### Environment Variables

Set up Postman environment:
- `baseUrl`: http://localhost:4000
- `aiBaseUrl`: http://localhost:5000
- `accessToken`: (will be set after login)

### Pre-request Script (for authenticated requests)

```javascript
pm.environment.set("accessToken", pm.environment.get("accessToken"));
```

## Testing with Python

```python
import requests

BASE_URL = "http://localhost:4000"
AI_BASE_URL = "http://localhost:5000"

# Register
response = requests.post(f"{BASE_URL}/api/v1/auth/register", json={
    "email": "test@example.com",
    "password": "SecurePass123!",
    "name": "Test User",
    "organizationName": "Test Org"
})
data = response.json()
access_token = data["accessToken"]

# Chat completion
response = requests.post(
    f"{AI_BASE_URL}/api/v1/chat",
    headers={"Authorization": f"Bearer {access_token}"},
    json={
        "messages": [
            {"role": "user", "content": "Hello!"}
        ]
    }
)
print(response.json())
```

## Testing with JavaScript/Node.js

```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost:4000';
const AI_BASE_URL = 'http://localhost:5000';

async function test() {
  // Register
  const registerResponse = await axios.post(`${BASE_URL}/api/v1/auth/register`, {
    email: 'test@example.com',
    password: 'SecurePass123!',
    name: 'Test User',
    organizationName: 'Test Org'
  });
  
  const accessToken = registerResponse.data.accessToken;
  
  // Chat completion
  const chatResponse = await axios.post(
    `${AI_BASE_URL}/api/v1/chat`,
    {
      messages: [
        { role: 'user', content: 'Hello!' }
      ]
    },
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  
  console.log(chatResponse.data);
}

test();
```

## Rate Limiting

The API implements rate limiting:
- **Default**: 100 requests per 60 seconds per IP
- **Authenticated**: 1000 requests per 60 seconds per organization

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704110400
```

## WebSocket Testing (Future)

For real-time features, connect to WebSocket:

```javascript
const ws = new WebSocket('ws://localhost:4000/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'authenticate',
    token: 'your-access-token'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```
