FROM rust:1.82-slim-bookworm AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libsqlite3-dev ca-certificates && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml ./
COPY migrations ./migrations
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-0 ca-certificates && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 10001 arca
COPY --from=builder /app/target/release/vaultguard-relay-server /usr/local/bin/vaultguard-relay-server
USER arca
ENV DATABASE_URL="sqlite:///tmp/arca_relay.db"
ENV TRUSTED_PROXY="true"
EXPOSE 8080
CMD ["/usr/local/bin/vaultguard-relay-server"]
