FROM node:22-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies using lockfile
RUN npm ci --omit=dev

# Copy service source code
COPY . .

# Expose Payment Service port
EXPOSE 3004

ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3004/health || exit 1

CMD ["node", "server.js"]
