FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first for better caching
COPY package.json /app/package.json
COPY tsconfig.json /app/tsconfig.json
RUN npm install

# Copy source and build
COPY src /app/src
COPY migrations /app/migrations
COPY knexfile.js /app/knexfile.js
RUN npm run build && npm prune --omit=dev


FROM node:20-alpine AS runner

ENV NODE_ENV=production \
    PORT=8001

WORKDIR /app

COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/migrations /app/migrations
COPY --from=builder /app/knexfile.js /app/knexfile.js

EXPOSE 8001

CMD ["node", "dist/index.js"]
