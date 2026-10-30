# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @karibu/api...
COPY apps/api apps/api
RUN pnpm --filter @karibu/api build && pnpm --filter @karibu/api deploy --prod --legacy /out

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production MIGRATIONS_DIR=/app/db/migrations PORT=4000
COPY --from=build /out .
COPY --from=build /repo/apps/api/dist ./dist
COPY db/migrations ./db/migrations
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
