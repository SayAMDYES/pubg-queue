# ── 阶段 1：构建前端 ──
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ── 阶段 2：构建后端（嵌入前端 dist）──
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/frontend/dist ./frontend/dist
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o pubg-queue .

# ── 阶段 3：运行 ──
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/pubg-queue .
RUN mkdir -p /data
VOLUME ["/data"]
ENV DB_PATH=/data/pubg_queue.db
EXPOSE 8080
ENTRYPOINT ["./pubg-queue"]
