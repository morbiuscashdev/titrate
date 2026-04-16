FROM node:22-slim AS build
WORKDIR /app

# Enable corepack for Yarn version pinning
RUN corepack enable

# Copy workspace root files and ALL workspace package.json files
# (Yarn resolves the full workspace graph — missing packages modify the lockfile)
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/sdk/package.json packages/sdk/
COPY packages/storage-fs/package.json packages/storage-fs/
COPY packages/storage-idb/package.json packages/storage-idb/
COPY packages/tui/package.json packages/tui/
COPY packages/web/package.json packages/web/

# Install all dependencies (frozen lockfile)
RUN yarn install --immutable

# Copy source
COPY packages/sdk packages/sdk
COPY packages/storage-idb packages/storage-idb
COPY packages/web packages/web
COPY tsconfig.base.json ./

# Build SDK and storage-idb first (web depends on them)
RUN yarn workspace @titrate/sdk build && \
    yarn workspace @titrate/storage-idb build

# Build web app
RUN yarn workspace @titrate/web build

# Serve with Caddy
FROM caddy:2-alpine
COPY packages/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/packages/web/dist /srv
ENV PORT=8080
EXPOSE ${PORT}
