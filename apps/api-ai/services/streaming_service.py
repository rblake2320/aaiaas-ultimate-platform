"""
Streaming Service for Real-time AI Responses
Implements Server-Sent Events (SSE) for streaming completions
"""

from typing import AsyncGenerator, Dict, Any
from openai import AsyncOpenAI
import json
import logging

logger = logging.getLogger(__name__)

class StreamingService:
    def __init__(self):
        # Async client enables true non-blocking streaming in FastAPI.
        self.client = AsyncOpenAI()
    
    async def stream_chat_completion(
        self,
        messages: list,
        model: str = "gpt-4.1-mini",
        temperature: float = 0.7,
        max_tokens: int = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream chat completion responses
        
        Yields:
            JSON-formatted chunks with delta content
        """
        try:
            stream = await self.client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True
            )
            
            async for chunk in stream:
                delta = chunk.choices[0].delta
                content = getattr(delta, "content", None)
                if content:
                    yield json.dumps({"type": "content", "content": content}) + "\n"
            
            # Send completion signal
            yield json.dumps({
                "type": "done",
                "finish_reason": "stop"
            }) + "\n"
            
        except Exception as e:
            logger.error(f"Streaming failed: {str(e)}")
            yield json.dumps({
                "type": "error",
                "error": str(e)
            }) + "\n"
    
    async def stream_text_completion(
        self,
        prompt: str,
        model: str = "gpt-4.1-mini",
        temperature: float = 0.7,
        max_tokens: int = 500
    ) -> AsyncGenerator[str, None]:
        """
        Stream text completion responses
        
        Yields:
            JSON-formatted chunks with delta content
        """
        messages = [{"role": "user", "content": prompt}]
        async for chunk in self.stream_chat_completion(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens
        ):
            yield chunk

# Global instance
streaming_service = StreamingService()
