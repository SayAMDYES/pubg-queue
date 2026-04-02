.PHONY: build run test clean hash

build:
	go build -o pubg-queue .

run:
	go run .

test:
	go test ./...

clean:
	rm -f pubg-queue data/pubg_queue.db

hash:
	@read -p "Password: " pw && \
	go run ./cmd/genhash "$$pw"

tidy:
	go mod tidy
