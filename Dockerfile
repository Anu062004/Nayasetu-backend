FROM node:22-alpine AS builder

WORKDIR /app

# Copy root and frontend package files for layer caching
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install root dependencies
RUN npm ci

# Install frontend dependencies
RUN cd frontend && npm ci

# Copy full source
COPY . .

# Build frontend and backend
RUN cd frontend && npm run build
RUN npm run build:backend

# Production image
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=development
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/db ./db

EXPOSE 3000

CMD ["node", "scripts/start-production.js"]