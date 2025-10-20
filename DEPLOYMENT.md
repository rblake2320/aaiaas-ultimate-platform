# aaIaaS.ai Deployment Guide

This guide covers deploying the aaIaaS.ai platform in various environments.

## Prerequisites

### Required Software
- **Node.js** 18+ and npm 9+
- **Python** 3.11+
- **PostgreSQL** 16+
- **Redis** 7+
- **Docker** (optional, for containerized deployment)

### Required API Keys
- **OpenAI API Key** (for AI services)
- **Stripe Keys** (optional, for billing)

## Local Development Setup

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install Control API dependencies
cd apps/api-control
npm install
cd ../..

# Install AI API dependencies
cd apps/api-ai
pip3 install -r requirements.txt
cd ../..

# Install Frontend dependencies
cd apps/web
npm install
cd ../..
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and update with your values:

```bash
cp .env.example .env
```

**Required variables:**
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: Random 32+ character string
- `REFRESH_TOKEN_SECRET`: Random 32+ character string
- `OPENAI_API_KEY`: Your OpenAI API key

### 3. Start Infrastructure Services

#### Option A: Using Docker Compose (Recommended)

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379
- Meilisearch on port 7700
- MailHog on ports 1025 (SMTP) and 8025 (UI)

#### Option B: Manual Installation

Install and start PostgreSQL and Redis manually on your system.

**PostgreSQL Setup:**
```bash
# Create database
createdb aaiaas

# Enable extensions
psql aaiaas -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
psql aaiaas -c "CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";"
psql aaiaas -c "CREATE EXTENSION IF NOT EXISTS \"vector\";"
```

**Redis Setup:**
```bash
# Start Redis
redis-server
```

### 4. Run Database Migrations

```bash
cd apps/api-control
npm run db:migrate
cd ../..
```

### 5. Start Development Servers

#### Option A: All Services at Once

```bash
npm run dev
```

This starts:
- Frontend on http://localhost:3000
- Control API on http://localhost:4000
- AI API on http://localhost:5000

#### Option B: Individual Services

**Terminal 1 - Control API:**
```bash
cd apps/api-control
npm run dev
```

**Terminal 2 - AI API:**
```bash
cd apps/api-ai
python3 -m uvicorn main:app --reload --port 5000
```

**Terminal 3 - Frontend:**
```bash
cd apps/web
npm run dev
```

### 6. Access the Platform

- **Frontend:** http://localhost:3000
- **Control API Docs:** http://localhost:4000/health
- **AI API Docs:** http://localhost:5000/docs
- **MailHog UI:** http://localhost:8025

## Production Deployment

### Architecture Overview

```
Internet
    │
    ├─> CDN/Edge (Cloudflare/Vercel)
    │       │
    │       └─> Next.js Frontend (Vercel)
    │
    └─> Load Balancer
            │
            ├─> Control API (Node.js)
            │       │
            │       └─> PostgreSQL
            │       └─> Redis
            │
            └─> AI API (Python/FastAPI)
                    │
                    └─> PostgreSQL
                    └─> Redis
```

### Frontend Deployment (Vercel)

1. **Connect Repository:**
   ```bash
   cd apps/web
   vercel
   ```

2. **Configure Environment Variables:**
   - `NEXT_PUBLIC_API_URL`: Your Control API URL
   - `NEXT_PUBLIC_AI_API_URL`: Your AI API URL

3. **Deploy:**
   ```bash
   vercel --prod
   ```

### Backend Deployment (Docker)

#### Build Images

```bash
# Control API
docker build -t aaiaas-control:latest -f apps/api-control/Dockerfile .

# AI API
docker build -t aaiaas-ai:latest -f apps/api-ai/Dockerfile .
```

#### Create Dockerfiles

**apps/api-control/Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY apps/api-control/package*.json ./
RUN npm ci --only=production

COPY apps/api-control .

RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]
```

**apps/api-ai/Dockerfile:**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY apps/api-ai/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/api-ai .

EXPOSE 5000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
```

#### Run Containers

```bash
# Control API
docker run -d \
  --name aaiaas-control \
  -p 4000:4000 \
  --env-file .env \
  aaiaas-control:latest

# AI API
docker run -d \
  --name aaiaas-ai \
  -p 5000:5000 \
  --env-file .env \
  aaiaas-ai:latest
```

### Database Setup (Production)

#### Managed PostgreSQL (Recommended)

Use a managed service:
- **AWS RDS**
- **Google Cloud SQL**
- **Azure Database for PostgreSQL**
- **Neon** (serverless)
- **Supabase**

#### Redis Setup (Production)

Use a managed service:
- **AWS ElastiCache**
- **Google Cloud Memorystore**
- **Azure Cache for Redis**
- **Upstash** (serverless)
- **Redis Cloud**

### Environment Variables (Production)

Create a `.env.production` file:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/aaiaas
REDIS_URL=redis://host:6379
JWT_SECRET=<strong-random-secret>
REFRESH_TOKEN_SECRET=<strong-random-secret>
OPENAI_API_KEY=<your-key>
CORS_ORIGIN=https://yourdomain.com
LOG_LEVEL=info
```

### SSL/TLS Configuration

Use a reverse proxy like Nginx or Caddy:

**Nginx Configuration:**
```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Kubernetes Deployment

Create Kubernetes manifests:

**k8s/control-api-deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aaiaas-control
spec:
  replicas: 3
  selector:
    matchLabels:
      app: aaiaas-control
  template:
    metadata:
      labels:
        app: aaiaas-control
    spec:
      containers:
      - name: control-api
        image: aaiaas-control:latest
        ports:
        - containerPort: 4000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: aaiaas-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: aaiaas-secrets
              key: redis-url
```

Apply manifests:
```bash
kubectl apply -f infra/k8s/
```

## Monitoring & Observability

### Health Checks

- Control API: `GET /health`
- AI API: `GET /health`

### Logging

Logs are written to:
- Console (development)
- Files in `logs/` directory (production)

Configure log aggregation with:
- **Datadog**
- **New Relic**
- **Sentry**
- **CloudWatch**

### Metrics

Monitor:
- API response times
- Error rates
- Database connection pool
- Redis memory usage
- Token consumption

## Scaling Considerations

### Horizontal Scaling

Both APIs are stateless and can be scaled horizontally:

```bash
# Scale Control API
kubectl scale deployment aaiaas-control --replicas=5

# Scale AI API
kubectl scale deployment aaiaas-ai --replicas=3
```

### Database Scaling

- Enable read replicas for read-heavy workloads
- Use connection pooling (PgBouncer)
- Implement caching with Redis

### Caching Strategy

- API responses (5-60 seconds)
- User sessions (Redis)
- Rate limit counters (Redis)
- Embeddings cache (Redis/PostgreSQL)

## Backup & Recovery

### Database Backups

```bash
# Backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore
psql $DATABASE_URL < backup-20240101.sql
```

### Automated Backups

Configure daily backups with:
- AWS RDS automated backups
- Google Cloud SQL backups
- Custom cron jobs

## Security Checklist

- [ ] Use strong JWT secrets (32+ characters)
- [ ] Enable HTTPS/TLS everywhere
- [ ] Configure CORS properly
- [ ] Set up rate limiting
- [ ] Enable database encryption at rest
- [ ] Use secrets management (AWS Secrets Manager, Vault)
- [ ] Implement audit logging
- [ ] Regular security updates
- [ ] Configure firewall rules
- [ ] Enable DDoS protection

## Troubleshooting

### Database Connection Issues

```bash
# Test PostgreSQL connection
psql $DATABASE_URL -c "SELECT 1;"

# Check PostgreSQL logs
docker-compose logs postgres
```

### Redis Connection Issues

```bash
# Test Redis connection
redis-cli -u $REDIS_URL ping

# Check Redis logs
docker-compose logs redis
```

### API Not Starting

```bash
# Check logs
npm run dev 2>&1 | tee debug.log

# Verify environment variables
node -e "require('dotenv').config(); console.log(process.env)"
```

### Migration Failures

```bash
# Rollback last migration
cd apps/api-control
npm run db:migrate:rollback

# Re-run migrations
npm run db:migrate
```

## Performance Optimization

### Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_workflows_org_id ON workflows(organization_id);
CREATE INDEX idx_usage_records_org_metric ON usage_records(organization_id, metric);

-- Analyze tables
ANALYZE users;
ANALYZE workflows;
```

### Redis Optimization

```bash
# Configure maxmemory policy
redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Monitor memory usage
redis-cli INFO memory
```

### API Optimization

- Enable response compression (gzip)
- Implement request caching
- Use connection pooling
- Optimize database queries
- Implement pagination

## Cost Optimization

### OpenAI API Costs

- Cache embeddings
- Use cheaper models when possible
- Implement request deduplication
- Set token limits per request

### Infrastructure Costs

- Use spot instances for non-critical workloads
- Enable auto-scaling
- Implement resource quotas
- Monitor and optimize database queries

## Support

For issues or questions:
- GitHub Issues: https://github.com/yourorg/aaiaas
- Email: support@aaiaas.ai
- Documentation: https://docs.aaiaas.ai
