FROM node:22-slim AS build
WORKDIR /app

# Enable corepack and pre-fetch Yarn so install doesn't need network for the binary
RUN corepack enable && corepack prepare yarn@4.14.0 --activate

# Ensure devDependencies are installed (needed for vite, tsc, etc.)
ENV NODE_ENV=development

# Copy workspace root files and ALL workspace package.json files
# (Yarn resolves the full workspace graph — missing packages modify the lockfile)
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/sdk/package.json packages/sdk/
COPY packages/storage-campaign/package.json packages/storage-campaign/
COPY packages/storage-fs/package.json packages/storage-fs/
COPY packages/storage-idb/package.json packages/storage-idb/
COPY packages/tui/package.json packages/tui/
COPY packages/web/package.json packages/web/

# Install all dependencies (frozen lockfile)
RUN yarn install --immutable

# Add hoisted binaries to PATH (vite, tsc, etc. live in root node_modules/.bin)
ENV PATH="/app/node_modules/.bin:$PATH"

# Copy source
COPY packages/sdk packages/sdk
COPY packages/storage-idb packages/storage-idb
COPY packages/web packages/web
COPY tsconfig.base.json ./

# Build SDK and storage-idb first (web depends on them)
RUN cd packages/sdk && yarn run build
RUN cd packages/storage-idb && yarn run build

# Build web app
RUN cd packages/web && yarn run build

# Serve with Caddy
FROM caddy:2-alpine
COPY packages/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/packages/web/dist /srv
ENV PORT=8080
EXPOSE ${PORT}
