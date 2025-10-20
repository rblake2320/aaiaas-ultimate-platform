from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import os
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="aaIaaS AI Services API",
    description="AI and ML services for automation platform",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGIN", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class HealthResponse(BaseModel):
    status: str
    timestamp: str
    service: str

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str = "gpt-4.1-mini"
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=4096)
    stream: bool = False

class ChatResponse(BaseModel):
    id: str
    model: str
    message: ChatMessage
    usage: Dict[str, int]
    created_at: str

class CompletionRequest(BaseModel):
    prompt: str
    model: str = "gpt-4.1-mini"
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: Optional[int] = Field(default=500, ge=1, le=4096)

class CompletionResponse(BaseModel):
    id: str
    model: str
    text: str
    usage: Dict[str, int]
    created_at: str

class EmbeddingRequest(BaseModel):
    input: str | List[str]
    model: str = "text-embedding-ada-002"

class EmbeddingResponse(BaseModel):
    embeddings: List[List[float]]
    model: str
    usage: Dict[str, int]

# Dependency for API key validation
async def verify_api_key(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization header")
    
    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0] not in ["Bearer", "ApiKey"]:
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    
    # In production, validate against database
    # For now, just check if key exists
    return parts[1]

# Routes
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="ok",
        timestamp=datetime.utcnow().isoformat(),
        service="api-ai"
    )

@app.post("/api/v1/chat", response_model=ChatResponse)
async def chat_completion(
    request: ChatRequest,
    api_key: str = Depends(verify_api_key)
):
    """
    Generate chat completion using LLM
    """
    try:
        from openai import OpenAI
        
        client = OpenAI()
        
        # Convert messages to OpenAI format
        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]
        
        # Call OpenAI API
        response = client.chat.completions.create(
            model=request.model,
            messages=messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
        
        return ChatResponse(
            id=response.id,
            model=response.model,
            message=ChatMessage(
                role=response.choices[0].message.role,
                content=response.choices[0].message.content
            ),
            usage={
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens,
            },
            created_at=datetime.utcnow().isoformat()
        )
    except Exception as e:
        logger.error(f"Chat completion error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/completions", response_model=CompletionResponse)
async def text_completion(
    request: CompletionRequest,
    api_key: str = Depends(verify_api_key)
):
    """
    Generate text completion
    """
    try:
        from openai import OpenAI
        
        client = OpenAI()
        
        # Use chat completion for text completion
        response = client.chat.completions.create(
            model=request.model,
            messages=[{"role": "user", "content": request.prompt}],
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
        
        return CompletionResponse(
            id=response.id,
            model=response.model,
            text=response.choices[0].message.content,
            usage={
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens,
            },
            created_at=datetime.utcnow().isoformat()
        )
    except Exception as e:
        logger.error(f"Text completion error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/embeddings", response_model=EmbeddingResponse)
async def create_embeddings(
    request: EmbeddingRequest,
    api_key: str = Depends(verify_api_key)
):
    """
    Generate embeddings for text
    """
    try:
        from openai import OpenAI
        
        client = OpenAI()
        
        # Ensure input is a list
        inputs = [request.input] if isinstance(request.input, str) else request.input
        
        # Call OpenAI embeddings API
        response = client.embeddings.create(
            model=request.model,
            input=inputs
        )
        
        embeddings = [item.embedding for item in response.data]
        
        return EmbeddingResponse(
            embeddings=embeddings,
            model=response.model,
            usage={
                "prompt_tokens": response.usage.prompt_tokens,
                "total_tokens": response.usage.total_tokens,
            }
        )
    except Exception as e:
        logger.error(f"Embeddings error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Global exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "5000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )



# Advanced AI Services
from services.rag_service import rag_service
from services.agent_service import Agent, Tool, create_agent
from services.streaming_service import streaming_service
from fastapi.responses import StreamingResponse

# RAG Endpoints
class RAGIndexRequest(BaseModel):
    text: str
    metadata: Optional[Dict[str, Any]] = None
    chunk_size: int = Field(default=500, ge=100, le=2000)

class RAGIndexResponse(BaseModel):
    chunks: int
    document_id: str
    status: str

class RAGQueryRequest(BaseModel):
    query: str
    top_k: int = Field(default=5, ge=1, le=20)
    system_prompt: Optional[str] = None
    temperature: float = Field(default=0.7, ge=0, le=2)

class RAGQueryResponse(BaseModel):
    answer: str
    sources: List[str]
    retrieval: Dict[str, Any]
    usage: Dict[str, int]

@app.post("/api/v1/rag/index", response_model=RAGIndexResponse)
async def index_document(
    request: RAGIndexRequest,
    api_key: str = Depends(verify_api_key)
):
    """
    Index a document for RAG retrieval
    """
    try:
        import uuid
        
        # Index the document
        indexed_docs = await rag_service.index_document(
            text=request.text,
            metadata=request.metadata,
            chunk_size=request.chunk_size
        )
        
        # In production, store in database
        # For now, store in memory (this is a demo)
        document_id = str(uuid.uuid4())
        
        # Store globally (in production, use database)
        if not hasattr(app.state, 'knowledge_base'):
            app.state.knowledge_base = {}
        
        app.state.knowledge_base[document_id] = indexed_docs
        
        return RAGIndexResponse(
            chunks=len(indexed_docs),
            document_id=document_id,
            status="indexed"
        )
    except Exception as e:
        logger.error(f"Document indexing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/rag/query", response_model=RAGQueryResponse)
async def rag_query(
    request: RAGQueryRequest,
    api_key: str = Depends(verify_api_key)
):
    """
    Query the RAG system
    """
    try:
        # Get knowledge base (in production, load from database)
        if not hasattr(app.state, 'knowledge_base'):
            raise HTTPException(status_code=404, detail="No documents indexed")
        
        # Flatten all documents
        all_docs = []
        for doc_list in app.state.knowledge_base.values():
            all_docs.extend(doc_list)
        
        # Perform RAG query
        result = await rag_service.rag_query(
            query=request.query,
            knowledge_base=all_docs,
            top_k=request.top_k,
            system_prompt=request.system_prompt,
            temperature=request.temperature
        )
        
        return RAGQueryResponse(
            answer=result["answer"],
            sources=result["sources"],
            retrieval=result["retrieval"],
            usage=result["usage"]
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"RAG query error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Agent Endpoints
class AgentRequest(BaseModel):
    task: str
    agent_type: str = Field(default="general", pattern="^(general|researcher|analyst)$")
    max_iterations: int = Field(default=10, ge=1, le=20)

class AgentResponse(BaseModel):
    answer: str
    iterations: int
    execution_trace: List[Dict[str, Any]]
    usage: Optional[Dict[str, int]] = None

@app.post("/api/v1/agent/run", response_model=AgentResponse)
async def run_agent(
    request: AgentRequest,
    api_key: str = Depends(verify_api_key)
):
    """
    Run an autonomous AI agent on a task
    """
    try:
        # Create agent
        agent = create_agent(agent_type=request.agent_type)
        agent.max_iterations = request.max_iterations
        
        # Run agent
        result = await agent.run(request.task)
        
        return AgentResponse(
            answer=result["answer"],
            iterations=result["iterations"],
            execution_trace=result["execution_trace"],
            usage=result.get("usage")
        )
    except Exception as e:
        logger.error(f"Agent execution error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Streaming Endpoints
class StreamChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str = "gpt-4.1-mini"
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=4096)

@app.post("/api/v1/chat/stream")
async def stream_chat(
    request: StreamChatRequest,
    api_key: str = Depends(verify_api_key)
):
    """
    Stream chat completion responses
    """
    try:
        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]
        
        return StreamingResponse(
            streaming_service.stream_chat_completion(
                messages=messages,
                model=request.model,
                temperature=request.temperature,
                max_tokens=request.max_tokens
            ),
            media_type="text/event-stream"
        )
    except Exception as e:
        logger.error(f"Stream chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class StreamTextRequest(BaseModel):
    prompt: str
    model: str = "gpt-4.1-mini"
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=500, ge=1, le=4096)

@app.post("/api/v1/completions/stream")
async def stream_completion(
    request: StreamTextRequest,
    api_key: str = Depends(verify_api_key)
):
    """
    Stream text completion responses
    """
    try:
        return StreamingResponse(
            streaming_service.stream_text_completion(
                prompt=request.prompt,
                model=request.model,
                temperature=request.temperature,
                max_tokens=request.max_tokens
            ),
            media_type="text/event-stream"
        )
    except Exception as e:
        logger.error(f"Stream completion error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Batch Processing Endpoint
class BatchRequest(BaseModel):
    requests: List[Dict[str, Any]]
    endpoint: str = Field(pattern="^(chat|completions|embeddings)$")

class BatchResponse(BaseModel):
    results: List[Dict[str, Any]]
    total: int
    successful: int
    failed: int

@app.post("/api/v1/batch", response_model=BatchResponse)
async def batch_process(
    request: BatchRequest,
    api_key: str = Depends(verify_api_key)
):
    """
    Process multiple requests in batch
    """
    results = []
    successful = 0
    failed = 0
    
    for req in request.requests:
        try:
            if request.endpoint == "chat":
                result = await chat_completion(
                    ChatRequest(**req),
                    api_key
                )
            elif request.endpoint == "completions":
                result = await text_completion(
                    CompletionRequest(**req),
                    api_key
                )
            elif request.endpoint == "embeddings":
                result = await create_embeddings(
                    EmbeddingRequest(**req),
                    api_key
                )
            
            results.append({"status": "success", "data": result.model_dump()})
            successful += 1
        except Exception as e:
            results.append({"status": "error", "error": str(e)})
            failed += 1
    
    return BatchResponse(
        results=results,
        total=len(request.requests),
        successful=successful,
        failed=failed
    )

