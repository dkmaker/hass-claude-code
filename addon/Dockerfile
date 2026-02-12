# Build context: addon/ directory
# HA Supervisor uses the config.yaml directory as build context.

# Global ARG — must be before any FROM to be visible across stages
ARG BUILD_FROM=ghcr.io/hassio-addons/base:20.0.1

# Stage 1: Build MCP server and pre-index docs
FROM node:22-alpine AS mcp-builder

RUN apk add --no-cache git build-base python3 && \
    corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /build

# Clone docs from the repository (same repo, just need the docs/ directory)
ARG DOCS_REPO=https://github.com/dkmaker/hass-claude-code.git
ARG DOCS_REF=main
RUN git clone --depth 1 --branch "${DOCS_REF}" "${DOCS_REPO}" /tmp/repo && \
    cp -r /tmp/repo/docs /build/docs && \
    rm -rf /tmp/repo

# Install MCP server dependencies
COPY mcp-server/package.json mcp-server/pnpm-lock.yaml* ./mcp-server/
RUN cd mcp-server && pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy MCP server source
COPY mcp-server/ ./mcp-server/

# Build keyword-only index (no embedding model needed)
RUN cd mcp-server && \
    DOCS_DB_PATH=/build/mcp-server/data/docs-search.db \
    DOCS_PATH=/build/docs \
    ENABLE_EMBEDDINGS=false \
    node --import tsx src/build-index.ts

# Stage 2: Final add-on image
# hadolint ignore=DL3006
FROM ${BUILD_FROM}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV TERM="xterm-256color"

# Install system packages
# hadolint ignore=DL3018
RUN apk add --no-cache \
    bash \
    ca-certificates \
    curl \
    git \
    libgcc \
    libstdc++ \
    nodejs \
    npm \
    ripgrep \
    tmux \
    ttyd

# Install Claude Code via official binary installer
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude Code to PATH and disable auto-updater
ENV PATH="/root/.local/bin:${PATH}" \
    DISABLE_AUTOUPDATER=1

# Copy MCP server from builder (source + deps + pre-built DB)
COPY --from=mcp-builder /build/mcp-server /opt/mcp-server

# Copy docs
COPY --from=mcp-builder /build/docs /opt/docs

# Copy rootfs overlay
COPY rootfs /

# Ensure scripts are executable
RUN chmod a+x /usr/bin/claude-entrypoint.sh \
    && find /etc/s6-overlay/s6-rc.d -name 'run' -exec chmod a+x {} \; \
    && find /etc/s6-overlay/s6-rc.d -name 'finish' -exec chmod a+x {} \;

# Build arguments for labels
ARG BUILD_ARCH
ARG BUILD_DATE
ARG BUILD_DESCRIPTION
ARG BUILD_NAME
ARG BUILD_REF
ARG BUILD_REPOSITORY
ARG BUILD_VERSION

# Labels
LABEL \
    io.hass.name="${BUILD_NAME}" \
    io.hass.description="${BUILD_DESCRIPTION}" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.type="addon" \
    io.hass.version=${BUILD_VERSION}
