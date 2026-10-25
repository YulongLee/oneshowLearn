# Patch updates are tested in CI; a release is deployed by immutable image ID.
ARG NODE_IMAGE=node:22-bookworm-slim
ARG NGINX_IMAGE=nginx:stable-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=oneshowlearn-security-runtime-npm,target=/root/.npm node -e "if(process.versions.node.split('.')[0]!=='22'||Number(process.versions.node.split('.')[1])<14)throw Error('Node 22.14+ / 22.x required')" && npm ci --no-audit --no-fund
COPY index.html vite.config.mjs vite.public.config.mjs ./
COPY src ./src
COPY public/assets ./public/assets
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
COPY scripts/check-public-seo-ui.mjs ./scripts/check-public-seo-ui.mjs
COPY scripts/check-homepage-promotion-live.mjs ./scripts/check-homepage-promotion-live.mjs
COPY scripts/check-auth-commercial-ui.mjs scripts/check-sidebar-refinement-ui.mjs scripts/check-workspace-theme-ui.mjs scripts/run-browser-checks.mjs scripts/run-acceptance-with-diagnostics.mjs ./scripts/
COPY deploy/configure-mineru.mjs deploy/update-commercial-completion.sh deploy/nginx-oneshowlearn.conf deploy/nginx-oneshowlearn-https.conf deploy/nginx-oneshowlearn-app.conf ./deploy/
COPY deploy/check-commercial-refinement.mjs deploy/package-commercial-refinement.mjs deploy/update-commercial-refinement.sh ./deploy/
COPY deploy/check-public-seo-release.mjs deploy/update-public-seo.sh ./deploy/
COPY deploy/check-security-dependency-release.mjs deploy/update-security-dependencies.sh deploy/security-dependency-policy.mjs deploy/security-runtime.Dockerfile deploy/inspect-security-runtime.mjs ./deploy/
COPY docs/curriculum/ai-opc-20261001.json ./docs/curriculum/ai-opc-20261001.json
COPY tests ./tests
COPY Dockerfile .dockerignore ./
COPY .github/workflows/ci.yml ./.github/workflows/ci.yml
RUN npm run test:engineering && node --test tests/dependency-security.test.mjs tests/security-dependency-release.test.mjs && npm test

FROM ${NODE_IMAGE} AS api
ARG REVISION=unknown
ARG SOURCE_HASH=unknown
LABEL org.opencontainers.image.revision=$REVISION io.oneshowlearn.source-hash=$SOURCE_HASH io.oneshowlearn.role=api
WORKDIR /app
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=8787 DATABASE_AUTO_MIGRATE=false
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=oneshowlearn-security-runtime-npm,target=/root/.npm node -e "if(process.versions.node.split('.')[0]!=='22'||Number(process.versions.node.split('.')[1])<14)throw Error('Node 22.14+ / 22.x required')" && npm ci --omit=dev --no-audit --no-fund && mkdir -p data uploads uploads-private uploads-staging && chown -R node:node data uploads uploads-private uploads-staging
COPY server ./server
COPY deploy/portable ./deploy/portable
USER node
COPY --from=build /app/dist/client /app/dist/client
COPY --from=build /app/dist/render /app/dist/render
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
