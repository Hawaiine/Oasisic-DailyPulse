FROM oven/bun:1.1-alpine AS builder
WORKDIR /app
COPY package*.json bun.lockb* ./
RUN bun install --frozen-lockfile
COPY . .

FROM oven/bun:1.1-alpine
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=builder /app /app
EXPOSE 8790
ENV NODE_ENV=production
ENV PORT=8790
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "src/server/index.ts"]
