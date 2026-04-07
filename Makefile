.PHONY: build run test clean hash tidy frontend build-all docker-build

# 仅构建后端（需先构建前端）
build:
	go build -o pubg-queue .

# 构建前端
frontend:
	cd frontend && npm ci && npm run build

# 完整构建（前端 + 后端）
build-all: frontend build

run:
	go run .

test:
	go test ./...

clean:
	rm -f pubg-queue data/pubg_queue.db
	rm -rf frontend/dist

hash:
	@read -p "Password: " pw && \
	go run ./cmd/genhash "$$pw"

tidy:
	go mod tidy

# 构建 Docker 镜像（自动检测地区、本地 Go/npm 环境，注入合适镜像源）
docker-build:
	bash docker-build.sh
