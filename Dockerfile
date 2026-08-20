FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json biome.json ./
COPY src ./src
COPY scripts ./scripts
COPY db ./db
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY scripts ./scripts
COPY db ./db
COPY config ./config
USER app
EXPOSE 3000
CMD ["node", "dist/bin/api.js"]