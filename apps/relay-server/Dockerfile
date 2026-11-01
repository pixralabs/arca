# ==========================================
# STAGE 1: Builder
# ==========================================
FROM rust:1.82-slim-bookworm AS builder
WORKDIR /app

# Install system dependencies required for compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libsqlite3-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy Cargo files from the monorepo path (Notice the apps/relay-server/ prefix)
COPY apps/relay-server/Cargo.toml ./
COPY apps/relay-server/Cargo.lock* ./

# Create a dummy main.rs to build and cache dependencies (Saves 5-10 mins on rebuilds)
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy the actual source code and migrations
COPY apps/relay-server/migrations ./migrations
COPY apps/relay-server/src ./src

# Build the actual application
RUN cargo build --release

# ==========================================
# STAGE 2: Runtime
# ==========================================
FROM debian:bookworm-slim AS runtime
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsqlite3-0 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 10001 arca

# Copy the compiled binary from the builder stage
COPY --from=builder /app/target/release/vaultguard-relay-server /usr/local/bin/vaultguard-relay-server

# Ensure the /tmp directory is writable by the non-root user for SQLite
RUN mkdir -p /tmp && chown arca:arca /tmp

USER arca

# Environment Variables (Defaults, can be overridden in Render)
ENV DATABASE_URL="sqlite:///tmp/arca_relay.db"
ENV TRUSTED_PROXY="true"
ENV PORT=8080

EXPOSE 8080

CMD ["/usr/local/bin/vaultguard-relay-server"]