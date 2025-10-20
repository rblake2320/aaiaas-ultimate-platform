# API Examples - aaIaaS.ai

This document provides comprehensive examples for using the aaIaaS.ai platform APIs.

## Authentication

All API requests require authentication using either JWT tokens or API keys. The platform supports two authentication methods depending on your use case.

### Using JWT Tokens

JWT tokens are ideal for user-facing applications where users log in through the web interface. After successful authentication, you receive an access token that must be included in the Authorization header of subsequent requests.

```bash
# Login to get JWT token
curl -X POST https://api.aaiaas.ai/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "your-password"
  }'

# Response includes access token and refresh token
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

### Using API Keys

API keys are recommended for server-to-server communication and automated workflows. They provide a simple, secure way to authenticate without managing user sessions.

```bash
# All requests with API key
curl -X POST https://api.aaiaas.ai/api/v1/chat \
  -H "Authorization: Bearer sk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Chat Completions

The chat completions endpoint enables conversational AI with support for multi-turn conversations, system prompts, and various models.

### Basic Chat

```bash
curl -X POST https://api.aaiaas.ai/api/v1/chat \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful AI assistant."
      },
      {
        "role": "user",
        "content": "What is the capital of France?"
      }
    ],
    "model": "gpt-4.1-mini",
    "temperature": 0.7
  }'
```

### Multi-turn Conversation

```bash
curl -X POST https://api.aaiaas.ai/api/v1/chat \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Tell me about Paris."},
      {"role": "assistant", "content": "Paris is the capital of France..."},
      {"role": "user", "content": "What are the top attractions?"}
    ],
    "temperature": 0.8,
    "max_tokens": 500
  }'
```

### Streaming Chat

For real-time responses, use the streaming endpoint which returns Server-Sent Events (SSE) as the model generates tokens.

```bash
curl -X POST https://api.aaiaas.ai/api/v1/chat/stream \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Write a short story about AI."}
    ],
    "model": "gpt-4.1-mini",
    "temperature": 0.9
  }'

# Response (Server-Sent Events)
data: {"type":"content","content":"Once"}
data: {"type":"content","content":" upon"}
data: {"type":"content","content":" a"}
data: {"type":"content","content":" time"}
data: {"type":"done","finish_reason":"stop"}
```

## Text Completions

The text completions endpoint is designed for single-turn text generation tasks such as content creation, summarization, and code generation.

```bash
curl -X POST https://api.aaiaas.ai/api/v1/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a product description for a smart watch:",
    "model": "gpt-4.1-mini",
    "temperature": 0.7,
    "max_tokens": 200
  }'
```

## Embeddings

Embeddings convert text into high-dimensional vectors that capture semantic meaning, enabling similarity search and clustering.

```bash
curl -X POST https://api.aaiaas.ai/api/v1/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": [
      "The quick brown fox jumps over the lazy dog",
      "A fast auburn canine leaps above an idle hound"
    ],
    "model": "text-embedding-ada-002"
  }'

# Response includes embeddings for each input
{
  "embeddings": [
    [0.123, -0.456, 0.789, ...],
    [0.124, -0.455, 0.790, ...]
  ],
  "model": "text-embedding-ada-002",
  "usage": {
    "prompt_tokens": 24,
    "total_tokens": 24
  }
}
```

## RAG (Retrieval Augmented Generation)

RAG combines semantic search with language models to provide context-aware, knowledge-grounded responses.

### Index Documents

Before querying, you need to index your documents. The system automatically chunks the text and generates embeddings.

```bash
curl -X POST https://api.aaiaas.ai/api/v1/rag/index \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Paris is the capital and most populous city of France. The city has an area of 105 square kilometers and a population of 2.2 million. Paris is known for landmarks like the Eiffel Tower, Louvre Museum, and Notre-Dame Cathedral.",
    "metadata": {
      "source": "Paris Guide",
      "category": "Travel"
    },
    "chunk_size": 500
  }'

# Response
{
  "chunks": 1,
  "document_id": "doc-123-456",
  "status": "indexed"
}
```

### Query with RAG

Once documents are indexed, you can query them with natural language questions. The system retrieves relevant chunks and uses them to generate informed answers.

```bash
curl -X POST https://api.aaiaas.ai/api/v1/rag/query \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the famous landmarks in Paris?",
    "top_k": 3,
    "temperature": 0.7
  }'

# Response
{
  "answer": "Paris is famous for several iconic landmarks including the Eiffel Tower, the Louvre Museum, and Notre-Dame Cathedral...",
  "sources": ["Paris Guide"],
  "retrieval": {
    "top_k": 3,
    "retrieved_documents": 1,
    "similarity_scores": [0.92]
  },
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 45,
    "total_tokens": 195
  }
}
```

## AI Agents

AI agents are autonomous systems that can plan, execute, and use tools to accomplish complex tasks.

```bash
curl -X POST https://api.aaiaas.ai/api/v1/agent/run \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Calculate the compound interest on $10,000 at 5% annual rate for 3 years, then search for current investment strategies.",
    "agent_type": "general",
    "max_iterations": 10
  }'

# Response includes execution trace
{
  "answer": "The compound interest calculation shows...",
  "iterations": 3,
  "execution_trace": [
    {
      "iteration": 1,
      "type": "tool_call",
      "tool": "calculate",
      "arguments": {"expression": "10000 * (1 + 0.05)^3 - 10000"}
    },
    {
      "iteration": 1,
      "type": "tool_result",
      "tool": "calculate",
      "result": {"expression": "...", "result": 1576.25}
    }
  ],
  "usage": {
    "prompt_tokens": 250,
    "completion_tokens": 120,
    "total_tokens": 370
  }
}
```

## Workflows

Workflows enable automation of complex, multi-step processes with AI integration.

### Create Workflow

```bash
curl -X POST https://api.aaiaas.ai/api/v1/workflows \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Content Generation Pipeline",
    "description": "Generate blog post from topic",
    "nodes": [
      {
        "id": "trigger",
        "type": "trigger",
        "config": {},
        "next": ["generate_outline"]
      },
      {
        "id": "generate_outline",
        "type": "action",
        "config": {
          "actionType": "ai_completion",
          "prompt": "Create a blog post outline for: {{topic}}",
          "model": "gpt-4.1-mini"
        },
        "next": ["generate_content"]
      },
      {
        "id": "generate_content",
        "type": "action",
        "config": {
          "actionType": "ai_completion",
          "prompt": "Write a blog post based on this outline: {{node_generate_outline}}",
          "model": "gpt-4.1-mini",
          "maxTokens": 1000
        }
      }
    ],
    "variables": {
      "apiKey": "YOUR_API_KEY"
    }
  }'
```

### Execute Workflow

```bash
curl -X POST https://api.aaiaas.ai/api/v1/workflows/workflow-id/execute \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "topic": "The Future of Artificial Intelligence"
    }
  }'

# Response
{
  "executionId": "exec-789",
  "status": "running",
  "message": "Workflow execution started"
}
```

### Check Execution Status

```bash
curl -X GET https://api.aaiaas.ai/api/v1/workflows/executions/exec-789 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Response
{
  "id": "exec-789",
  "workflowId": "workflow-id",
  "status": "completed",
  "input": {"topic": "The Future of Artificial Intelligence"},
  "output": "Full blog post content...",
  "startedAt": "2024-01-15T10:00:00Z",
  "completedAt": "2024-01-15T10:00:45Z"
}
```

## Batch Processing

Process multiple requests efficiently in a single API call.

```bash
curl -X POST https://api.aaiaas.ai/api/v1/batch \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "chat",
    "requests": [
      {
        "messages": [{"role": "user", "content": "What is AI?"}],
        "temperature": 0.7
      },
      {
        "messages": [{"role": "user", "content": "What is ML?"}],
        "temperature": 0.7
      },
      {
        "messages": [{"role": "user", "content": "What is NLP?"}],
        "temperature": 0.7
      }
    ]
  }'

# Response
{
  "results": [
    {"status": "success", "data": {...}},
    {"status": "success", "data": {...}},
    {"status": "success", "data": {...}}
  ],
  "total": 3,
  "successful": 3,
  "failed": 0
}
```

## API Key Management

### Create API Key

```bash
curl -X POST https://api.aaiaas.ai/api/v1/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production API Key",
    "scopes": ["chat", "completions", "embeddings"],
    "rateLimit": 1000
  }'

# Response (key shown only once!)
{
  "id": "key-123",
  "key": "sk_abc123def456...",
  "message": "API key created successfully. Save this key securely - it will not be shown again."
}
```

### List API Keys

```bash
curl -X GET https://api.aaiaas.ai/api/v1/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Response
{
  "apiKeys": [
    {
      "id": "key-123",
      "name": "Production API Key",
      "keyPrefix": "sk_abc123",
      "scopes": ["chat", "completions", "embeddings"],
      "rateLimit": 1000,
      "revoked": false,
      "lastUsedAt": "2024-01-15T10:30:00Z",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

## Usage Analytics

### Get Usage Summary

```bash
curl -X GET https://api.aaiaas.ai/api/v1/api-keys/usage/summary \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Response
{
  "currentMonth": {
    "usage": {
      "api_calls": 1234,
      "tokens_input": 25000,
      "tokens_output": 20000
    },
    "cost": 23.45,
    "period": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-01-31T23:59:59Z"
    }
  },
  "lastMonth": {
    "usage": {...},
    "cost": 21.67
  },
  "comparison": {
    "costChange": 1.78,
    "costChangePercent": 8.2
  }
}
```

### Get Daily Usage

```bash
curl -X GET "https://api.aaiaas.ai/api/v1/api-keys/usage/daily?metric=api_calls&days=30" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Response
{
  "metric": "api_calls",
  "data": [
    {"date": "2024-01-01", "value": 45},
    {"date": "2024-01-02", "value": 52},
    {"date": "2024-01-03", "value": 38}
  ]
}
```

## Error Handling

The API uses standard HTTP status codes and returns detailed error messages in JSON format.

```bash
# Example error response
{
  "error": "Invalid API key",
  "code": "INVALID_API_KEY",
  "statusCode": 401,
  "details": {
    "message": "The provided API key is invalid or has been revoked"
  }
}
```

Common status codes include 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 429 (Too Many Requests), and 500 (Internal Server Error).

## Rate Limiting

All API endpoints are subject to rate limiting based on your subscription plan and API key configuration. Rate limit information is included in response headers.

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1640000000
```

When you exceed your rate limit, the API returns a 429 status code with information about when you can retry.

## Python SDK Example

```python
import requests

class AaIaaSClient:
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = "https://api.aaiaas.ai/api/v1"
        
    def chat(self, messages, model="gpt-4.1-mini", temperature=0.7):
        response = requests.post(
            f"{self.base_url}/chat",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "messages": messages,
                "model": model,
                "temperature": temperature
            }
        )
        return response.json()

# Usage
client = AaIaaSClient("sk_your_api_key")
result = client.chat([
    {"role": "user", "content": "Hello, AI!"}
])
print(result["choices"][0]["message"]["content"])
```

## TypeScript SDK Example

```typescript
class AaIaaSClient {
  private apiKey: string;
  private baseUrl: string = "https://api.aaiaas.ai/api/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(messages: Array<{role: string; content: string}>, options = {}) {
    const response = await fetch(`${this.baseUrl}/chat`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages,
        model: "gpt-4.1-mini",
        temperature: 0.7,
        ...options
      })
    });
    return response.json();
  }
}

// Usage
const client = new AaIaaSClient("sk_your_api_key");
const result = await client.chat([
  { role: "user", content: "Hello, AI!" }
]);
console.log(result.choices[0].message.content);
```

---

For more examples and detailed documentation, visit our [Developer Portal](https://docs.aaiaas.ai).

