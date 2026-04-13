# Base image pinned by dependabot; digest updates via weekly PR.
FROM node:25-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages packages
COPY app app
RUN npm ci
RUN npm run build --workspace @claudenomics/enclave

FROM node:25-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/node_modules /app/node_modules
COPY --from=build /repo/packages /app/packages
EXPOSE 8787
CMD ["node", "packages/enclave/dist/index.js"]
