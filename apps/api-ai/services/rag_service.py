"""
Advanced RAG (Retrieval Augmented Generation) Service
Implements semantic search with embeddings and context-aware generation
"""

from typing import List, Dict, Any, Optional
import numpy as np
from openai import OpenAI
import logging

logger = logging.getLogger(__name__)

class RAGService:
    def __init__(self):
        self.client = OpenAI()
        self.embedding_model = "text-embedding-ada-002"
        self.chat_model = "gpt-4.1-mini"
        
    async def create_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Create embeddings for multiple texts"""
        try:
            response = self.client.embeddings.create(
                model=self.embedding_model,
                input=texts
            )
            return [item.embedding for item in response.data]
        except Exception as e:
            logger.error(f"Embedding creation failed: {str(e)}")
            raise
    
    def cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        a_np = np.array(a)
        b_np = np.array(b)
        return np.dot(a_np, b_np) / (np.linalg.norm(a_np) * np.linalg.norm(b_np))
    
    async def semantic_search(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Perform semantic search on documents
        
        Args:
            query: Search query
            documents: List of documents with 'text' and 'embedding' fields
            top_k: Number of top results to return
            
        Returns:
            List of top matching documents with similarity scores
        """
        # Create query embedding
        query_embedding = (await self.create_embeddings([query]))[0]
        
        # Calculate similarities
        results = []
        for doc in documents:
            if 'embedding' in doc:
                similarity = self.cosine_similarity(query_embedding, doc['embedding'])
                results.append({
                    **doc,
                    'similarity': similarity
                })
        
        # Sort by similarity and return top_k
        results.sort(key=lambda x: x['similarity'], reverse=True)
        return results[:top_k]
    
    async def generate_with_context(
        self,
        query: str,
        context_documents: List[Dict[str, Any]],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000
    ) -> Dict[str, Any]:
        """
        Generate response using retrieved context
        
        Args:
            query: User query
            context_documents: Retrieved documents to use as context
            system_prompt: Optional system prompt
            temperature: Generation temperature
            max_tokens: Maximum tokens to generate
            
        Returns:
            Generated response with metadata
        """
        # Build context from documents
        context = "\n\n".join([
            f"Document {i+1}:\n{doc.get('text', '')}"
            for i, doc in enumerate(context_documents)
        ])
        
        # Build messages
        messages = []
        
        if system_prompt:
            messages.append({
                "role": "system",
                "content": system_prompt
            })
        
        messages.append({
            "role": "user",
            "content": f"Context:\n{context}\n\nQuestion: {query}\n\nPlease answer based on the provided context."
        })
        
        # Generate response
        try:
            response = self.client.chat.completions.create(
                model=self.chat_model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            
            return {
                "answer": response.choices[0].message.content,
                "model": response.model,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens
                },
                "context_documents": len(context_documents),
                "sources": [doc.get('source', 'Unknown') for doc in context_documents]
            }
        except Exception as e:
            logger.error(f"Generation failed: {str(e)}")
            raise
    
    async def rag_query(
        self,
        query: str,
        knowledge_base: List[Dict[str, Any]],
        top_k: int = 5,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """
        Complete RAG pipeline: retrieve and generate
        
        Args:
            query: User query
            knowledge_base: List of documents with embeddings
            top_k: Number of documents to retrieve
            system_prompt: Optional system prompt
            temperature: Generation temperature
            
        Returns:
            Generated answer with sources and metadata
        """
        # Retrieve relevant documents
        relevant_docs = await self.semantic_search(query, knowledge_base, top_k)
        
        # Generate answer with context
        result = await self.generate_with_context(
            query=query,
            context_documents=relevant_docs,
            system_prompt=system_prompt,
            temperature=temperature
        )
        
        # Add retrieval metadata
        result['retrieval'] = {
            'top_k': top_k,
            'retrieved_documents': len(relevant_docs),
            'similarity_scores': [doc['similarity'] for doc in relevant_docs]
        }
        
        return result
    
    async def chunk_text(
        self,
        text: str,
        chunk_size: int = 500,
        overlap: int = 50
    ) -> List[str]:
        """
        Split text into overlapping chunks
        
        Args:
            text: Text to chunk
            chunk_size: Size of each chunk in characters
            overlap: Overlap between chunks
            
        Returns:
            List of text chunks
        """
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            chunks.append(chunk)
            start = end - overlap
        
        return chunks
    
    async def index_document(
        self,
        text: str,
        metadata: Optional[Dict[str, Any]] = None,
        chunk_size: int = 500
    ) -> List[Dict[str, Any]]:
        """
        Index a document by chunking and creating embeddings
        
        Args:
            text: Document text
            metadata: Optional metadata to attach to chunks
            chunk_size: Size of text chunks
            
        Returns:
            List of indexed chunks with embeddings
        """
        # Chunk the text
        chunks = await self.chunk_text(text, chunk_size)
        
        # Create embeddings for all chunks
        embeddings = await self.create_embeddings(chunks)
        
        # Build indexed documents
        indexed_docs = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            doc = {
                'text': chunk,
                'embedding': embedding,
                'chunk_index': i,
                'total_chunks': len(chunks)
            }
            if metadata:
                doc.update(metadata)
            indexed_docs.append(doc)
        
        return indexed_docs

# Global instance
rag_service = RAGService()
