# Production image for the NestJS API (Phase 12).
# Multi-stage: compile with dev deps, then run a slim prod-only image.
# Matches the node:20-alpine runtime already used in docker-compose, so the
# bcrypt native module resolves the same musl prebuild it does locally.

# --- build stage -----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- runtime stage ---------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Prod deps only. If bcrypt ever fails to fetch a musl prebuild on a new Node
# minor, add build tools for this step:
#   RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev
# Compiled app (includes dist/scripts/seed-admin.js for one-off admin seeding).
COPY --from=build /app/dist ./dist
EXPOSE 3000
# Render/Fly inject PORT; main.ts already listens on 0.0.0.0:${PORT:-3000}.
CMD ["node", "dist/main"]
