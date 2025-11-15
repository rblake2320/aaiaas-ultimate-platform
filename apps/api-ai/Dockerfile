# Multi-stage build for Python AI Services API
FROM python:3.11-slim AS builder

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    make \
    libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
# Note: Exclude heavy OCR dependencies for lightweight builds
# If you need OCR, uncomment the full requirements install
RUN pip install --user --no-warn-script-location \
    fastapi==0.109.0 \
    uvicorn[standard]==0.27.0 \
    pydantic==2.5.3 \
    pydantic-settings==2.1.0 \
    python-dotenv==1.0.0 \
    python-multipart==0.0.6 \
    python-jose[cryptography]==3.3.0 \
    passlib[bcrypt]==1.7.4 \
    asyncpg==0.29.0 \
    redis==5.0.1 \
    openai==1.7.2 \
    langchain==0.1.0 \
    langchain-openai==0.0.2 \
    langchain-community==0.0.10 \
    tiktoken==0.5.2 \
    numpy==1.26.3 \
    psycopg2-binary==2.9.9 \
    pgvector==0.2.4 \
    httpx==0.26.0 \
    aiofiles==23.2.1 \
    python-json-logger==2.0.7 \
    python-dateutil==2.8.2

# For full OCR support, use this instead:
# RUN pip install --user --no-warn-script-location -r requirements.txt

# Production stage
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/home/appuser/.local/bin:$PATH"

# Install runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libpq5 \
    tini && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1001 -s /bin/bash appuser

# Set working directory
WORKDIR /app

# Copy Python packages from builder
COPY --from=builder --chown=appuser:appuser /root/.local /home/appuser/.local

# Copy application code
COPY --chown=appuser:appuser . .

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health').read()" || exit 1

# Use tini as init system
ENTRYPOINT ["/usr/bin/tini", "--"]

# Start application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
