# ============================================
# OmniAI — Production Dockerfile
# ============================================
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# ============================================
# Runtime stage
# ============================================
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

# Copy installed deps and source
COPY --from=build /app/node_modules ./node_modules
COPY server ./server
COPY package*.json ./
COPY index.html css js ./ 2>/dev/null || true

# Copy .env.example for reference only (not used at runtime)
COPY .env.example ./

# Non-root user
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 3000
CMD ["node", "server/src/index.js"]