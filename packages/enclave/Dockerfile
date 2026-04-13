# Base image pinned by dependabot; digest updates via weekly PR.
FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages/logger packages/logger
COPY packages/usage packages/usage
COPY packages/enclave packages/enclave
RUN npm ci --workspaces --include-workspace-root \
  --omit=optional \
  --workspace @claudenomics/logger \
  --workspace @claudenomics/usage \
  --workspace @claudenomics/enclave
RUN npm run build --workspace @claudenomics/enclave

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/node_modules /app/node_modules
COPY --from=build /repo/packages /app/packages
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 8787
CMD ["node", "packages/enclave/dist/index.js"]
