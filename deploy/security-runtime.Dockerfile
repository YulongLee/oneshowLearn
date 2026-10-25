# Isolated dependency compatibility evidence only. Never installs production Node
# or takes over the existing systemd/Nginx installation.
FROM public.ecr.aws/docker/library/node:22.14.0-bookworm-slim
WORKDIR /candidate
COPY package.json package-lock.json ./
# Dedicated public-tarball cache only: npm still enforces the committed integrity
# hashes, standard TLS, timeout and zero transport retries. Never caches secrets.
RUN --mount=type=cache,id=oneshowlearn-security-runtime-npm,target=/root/.npm npm ci --omit=dev --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --fetch-timeout=15000 --fetch-retries=0
COPY tests/dependency-security.test.mjs ./tests/dependency-security.test.mjs
COPY deploy/security-dependency-policy.mjs deploy/inspect-security-runtime.mjs ./deploy/
CMD ["node", "deploy/inspect-security-runtime.mjs"]
