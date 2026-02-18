FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY packages/engine/ packages/engine/
COPY packages/server/ packages/server/

RUN pnpm --filter @sdr/shared build
RUN pnpm --filter @sdr/engine build
RUN pnpm --filter @sdr/server build

FROM node:22-slim
WORKDIR /app
RUN corepack enable pnpm

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/shared/ packages/shared/
COPY --from=build /app/packages/engine/ packages/engine/
COPY --from=build /app/packages/server/ packages/server/
COPY --from=build /app/node_modules/ node_modules/

EXPOSE 2567
CMD ["node", "packages/server/dist/index.js"]
