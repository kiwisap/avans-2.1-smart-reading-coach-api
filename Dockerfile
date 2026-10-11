# Image of the Smart Reading Coach API, built in three stages so the image that runs only
# contains what it needs: no TypeScript, no dev dependencies and no source files.

# Stage 1: install everything and compile TypeScript to dist/
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Stage 2: production dependencies only
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 3: the image that runs
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
# SQL migrations (run on start) and the catalogue file for the one time import
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node data ./data

# Do not run as root
USER node
EXPOSE 3000

# Used by "docker run" and docker compose. Azure Container Apps has its own health probes.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# Apply database migrations first, then start the server. All settings come from environment
# variables (see .env.example), there is no .env file in the image.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/server.js"]
