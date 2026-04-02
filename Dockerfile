FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o pubg-queue .

FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/pubg-queue .
COPY --from=builder /app/static ./static
RUN mkdir -p /data
VOLUME ["/data"]
ENV DB_PATH=/data/pubg_queue.db
EXPOSE 8080
ENTRYPOINT ["./pubg-queue"]
