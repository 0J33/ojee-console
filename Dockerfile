FROM node:22-slim

WORKDIR /app

# Install the tailscale CLI so the gate can use `tailscale whois`, which is
# authoritative. Without it the gate falls back to CIDR membership — weaker,
# and it cannot attribute a session to a real user. The container must share
# the host's network namespace (or mount the socket) for this to reach the
# daemon; see docker-compose.yml.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
 && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg > /usr/share/keyrings/tailscale-archive-keyring.gpg \
 && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list > /etc/apt/sources.list.d/tailscale.list \
 && apt-get update && apt-get install -y --no-install-recommends tailscale \
 && apt-get purge -y gnupg && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY examples ./examples

ENV NODE_ENV=production \
    PORT=8100 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

# Trusted devices live here. Mount it, or every device re-enrols on each deploy.
VOLUME ["/data"]
EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8100)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
