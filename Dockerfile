# Patch updates are tested in CI; a release is deployed by immutable image ID.
ARG NODE_IMAGE=node:22-bookworm-slim
ARG NGINX_IMAGE=nginx:stable-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN node -e "if(process.versions.node.split('.')[0]!=='22'||Number(process.versions.node.split('.')[1])<14)throw Error('Node 22.14+ / 22.x required')" && npm ci --no-audit --no-fund
COPY index.html vite.config.mjs ./
COPY src ./src
COPY server ./server
COPY scripts/prepare-sites-build.mjs ./scripts/prepare-sites-build.mjs
COPY worker/index.js ./worker/index.js
COPY .openai/hosting.json ./.openai/hosting.json
RUN npm run build

FROM build AS verification
COPY server ./server
COPY deploy/portable ./deploy/portable
COPY deploy/import-demo-materials.mjs deploy/publish-demo-projects.mjs deploy/import-opc-curriculum.mjs ./deploy/
COPY scripts/prepare-opc-curriculum.mjs ./scripts/prepare-opc-curriculum.mjs
COPY scripts/check-operations.mjs ./scripts/check-operations.mjs
COPY deploy/configure-mineru.mjs deploy/update-commercial-completion.sh deploy/nginx-oneshowlearn.conf deploy/nginx-oneshowlearn-https.conf deploy/nginx-oneshowlearn-app.conf ./deploy/
COPY deploy/check-commercial-refinement.mjs deploy/package-commercial-refinement.mjs deploy/update-commercial-refinement.sh ./deploy/
COPY docs/curriculum/ai-opc-20261001.json ./docs/curriculum/ai-opc-20261001.json
COPY tests ./tests
COPY Dockerfile .dockerignore ./
COPY .github/workflows/ci.yml ./.github/workflows/ci.yml
RUN npm run test:engineering && npm test

FROM ${NODE_IMAGE} AS api
ARG REVISION=unknown
ARG SOURCE_HASH=unknown
LABEL org.opencontainers.image.revision=$REVISION io.oneshowlearn.source-hash=$SOURCE_HASH io.oneshowlearn.role=api
WORKDIR /app
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=8787 DATABASE_AUTO_MIGRATE=false
COPY package.json package-lock.json ./
RUN node -e "if(process.versions.node.split('.')[0]!=='22'||Number(process.versions.node.split('.')[1])<14)throw Error('Node 22.14+ / 22.x required')" && npm ci --omit=dev --no-audit --no-fund && mkdir -p data uploads uploads-private uploads-staging && chown -R node:node data uploads uploads-private uploads-staging
COPY server ./server
COPY deploy/portable ./deploy/portable
USER node
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 CMD ["node", "deploy/portable/health.mjs"]
CMD ["node", "deploy/portable/start.mjs"]

FROM ${NGINX_IMAGE} AS web
ARG REVISION=unknown
ARG SOURCE_HASH=unknown
LABEL org.opencontainers.image.revision=$REVISION io.oneshowlearn.source-hash=$SOURCE_HASH io.oneshowlearn.role=web
COPY --from=build /app/dist/client /usr/share/nginx/html
COPY deploy/portable/nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 CMD wget -q -O /dev/null http://127.0.0.1:8080/api/ready || exit 1
EXPOSE 8080
