FROM node:22-alpine AS build
WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/storage-idb/package.json packages/storage-idb/
COPY packages/web/package.json packages/web/

# Install all dependencies (needed for workspace resolution)
RUN npm ci --ignore-scripts

# Copy source
COPY packages/sdk packages/sdk
COPY packages/storage-idb packages/storage-idb
COPY packages/web packages/web
COPY tsconfig.base.json ./

# Build SDK and storage-idb first (web depends on them)
RUN npm run build --workspace=packages/sdk --if-present && \
    npm run build --workspace=packages/storage-idb --if-present

# Build web app
RUN npm run build --workspace=packages/web

# Serve with Caddy
FROM caddy:2-alpine
COPY packages/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/packages/web/dist /srv
ENV PORT=8080
EXPOSE ${PORT}
