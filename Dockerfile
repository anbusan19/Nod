# Nod backend. Build from the repository root:  docker build -t nod-backend .
# Not yet built or run in CI: treat the first build as part of your own verification.

FROM node:24-slim AS build
WORKDIR /app
# Workspace manifests first, so dependency installs are cached.
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY sdk/package.json sdk/
COPY demo-agent/package.json demo-agent/
# --ignore-scripts: the root "prepare" script builds the SDK, which is not needed (or present) here.
RUN npm ci -w backend --ignore-scripts
COPY backend/ backend/
RUN npm run build -w backend

FROM node:24-slim
ENV NODE_ENV=production PORT=3000 DATABASE_URL=/data/nod.db TRUST_PROXY=true
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY sdk/package.json sdk/
COPY demo-agent/package.json demo-agent/
RUN npm ci -w backend --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
# The database lives on a volume so it survives restarts and upgrades.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/dist/index.js"]
