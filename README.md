# aaIaaS.ai - Automation & AI as a Service Platform

Enterprise-grade AI-as-a-Service platform with comprehensive automation, multi-tenancy, and developer-first API.

## Features

- 📄 **OCR & Document Processing**: DeepSeek-OCR for document scanning, text extraction, and visual understanding
- 🤖 **AI/ML Services**: LLM orchestration, RAG, embeddings, and agent framework
- 🔄 **Workflow Automation**: Visual workflow builder and execution engine
- 👥 **Multi-Tenancy**: Organization-based isolation with RBAC
- 🔐 **Enterprise Auth**: JWT, API keys, SSO/SAML ready
- 💳 **Usage-Based Billing**: Stripe integration with metered billing
- 📊 **Analytics**: Real-time usage tracking and insights
- 🔌 **Developer API**: RESTful API with OpenAPI docs
- 🎨 **Modern UI**: Next.js dashboard with Tailwind CSS
- 🔒 **Security**: Rate limiting, audit logs, encryption
- 📦 **Extensible**: Plugin system and webhook support

## Tech Stack

### Frontend
- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Query
- Zustand

### Backend
- FastAPI (Python) - AI Services
- Express (Node.js) - Control Plane
- PostgreSQL + pgvector
- Redis
- OpenAI API

### Infrastructure
- Docker + Docker Compose
- Vercel (Frontend)
- Cloud hosting (Backend)

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker & Docker Compose
- PostgreSQL 16+
- Redis 7+

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourorg/aaiaas.git
cd aaiaas
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start infrastructure services**
```bash
docker-compose up -d
```

5. **Run database migrations**
```bash
npm run db:migrate
```

6. **Start development servers**
```bash
npm run dev
```

The services will be available at:
- Frontend: http://localhost:3000
- Control Plane API: http://localhost:4000
- AI Services API: http://localhost:5000
- API Docs: http://localhost:4000/docs

## Project Structure

```
aaiaas/
├── apps/
│   ├── web/                 # Next.js frontend
│   ├── api-control/         # Express control plane API
│   ├── api-ai/              # FastAPI AI services
│   └── docs/                # Documentation site
├── packages/
│   ├── ui/                  # Shared UI components
│   ├── config/              # Shared configurations
│   ├── sdk-ts/              # TypeScript SDK
│   └── sdk-python/          # Python SDK
├── infra/
│   ├── docker/              # Docker configurations
│   ├── k8s/                 # Kubernetes manifests
│   └── terraform/           # Infrastructure as Code
└── scripts/                 # Utility scripts
```

## Development

### Running Individual Services

```bash
# Frontend only
cd apps/web && npm run dev

# Control Plane API only
cd apps/api-control && npm run dev

# AI Services API only
cd apps/api-ai && python -m uvicorn main:app --reload
```

### Database Migrations

```bash
# Create a new migration
npm run db:migrate:create -- --name=add_new_table

# Run migrations
npm run db:migrate

# Rollback last migration
npm run db:migrate:rollback
```

### Testing

```bash
# Run all tests
npm test

# Run tests for specific package
npm test -- --filter=web
```

### Linting & Formatting

```bash
# Lint all packages
npm run lint

# Format code
npm run format
```

## API Documentation

Interactive API documentation is available at:
- Control Plane: http://localhost:4000/docs
- AI Services: http://localhost:5000/docs

## Deployment

### Frontend (Vercel)

```bash
cd apps/web
vercel deploy
```

### Backend (Docker)

```bash
# Build images
docker build -t aaiaas-control -f apps/api-control/Dockerfile .
docker build -t aaiaas-ai -f apps/api-ai/Dockerfile .

# Run containers
docker run -p 4000:4000 aaiaas-control
docker run -p 5000:5000 aaiaas-ai
```

## Environment Variables

See `.env.example` for all available configuration options.

### Required Variables

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: Secret key for JWT tokens
- `OPENAI_API_KEY`: OpenAI API key

### Optional Variables

- `STRIPE_SECRET_KEY`: For billing integration
- `SENDGRID_API_KEY`: For email notifications
- `SENTRY_DSN`: For error tracking

## Security

- All passwords are hashed using bcrypt
- JWT tokens with short expiration
- Rate limiting on all endpoints
- CORS configured for specific origins
- SQL injection prevention
- XSS protection
- Security headers (CSP, HSTS, etc.)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

Proprietary - All rights reserved

## Support

For support, email support@aaiaas.ai or visit our documentation at https://docs.aaiaas.ai
