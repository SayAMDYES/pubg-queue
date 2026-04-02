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
	@read -p "Password: " pw; \
	go run -e 'package main; import ("fmt"; "golang.org/x/crypto/bcrypt"); func main() { h, _ := bcrypt.GenerateFromPassword([]byte("'"$$pw"'"), 10); fmt.Println(string(h)) }'

tidy:
	go mod tidy
