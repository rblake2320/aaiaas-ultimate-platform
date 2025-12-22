FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/knexfile.js ./knexfile.js
COPY --from=build /app/migrations ./migrations

EXPOSE 4000

# Run migrations on start, then launch API
CMD ["sh", "-c", "npm run db:migrate && node dist/index.js"]

