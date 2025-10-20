#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting aaIaaS.ai Development Environment${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Start infrastructure services
echo -e "${GREEN}Starting infrastructure services (PostgreSQL, Redis)...${NC}"
docker-compose up -d

# Wait for PostgreSQL to be ready
echo -e "${GREEN}Waiting for PostgreSQL to be ready...${NC}"
until docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
    sleep 1
done

echo -e "${GREEN}PostgreSQL is ready!${NC}"
echo ""

# Run database migrations
echo -e "${GREEN}Running database migrations...${NC}"
cd apps/api-control && npm run db:migrate && cd ../..

echo ""
echo -e "${GREEN}All services are ready!${NC}"
echo ""
echo -e "${BLUE}You can now start the development servers:${NC}"
echo -e "  ${GREEN}npm run dev${NC}  - Start all services"
echo ""
echo -e "${BLUE}Services will be available at:${NC}"
echo -e "  Frontend:     ${GREEN}http://localhost:3000${NC}"
echo -e "  Control API:  ${GREEN}http://localhost:4000${NC}"
echo -e "  AI API:       ${GREEN}http://localhost:5000${NC}"
echo -e "  PostgreSQL:   ${GREEN}localhost:5432${NC}"
echo -e "  Redis:        ${GREEN}localhost:6379${NC}"
echo ""
