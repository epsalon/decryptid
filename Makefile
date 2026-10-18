# Web build: the Go engine as WebAssembly plus Go's JS glue, into web/.
WEB := web
NODE ?= node

.PHONY: web serve test smoke clean

web:
	GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o $(WEB)/decryptid.wasm ./wasm
	cp "$$(go env GOROOT)/lib/wasm/wasm_exec.js" $(WEB)/wasm_exec.js

serve: web
	python3 -m http.server -d $(WEB) 8000

test:
	go test ./...

smoke: web
	$(NODE) $(WEB)/test/smoke.mjs

clean:
	rm -f $(WEB)/decryptid.wasm $(WEB)/wasm_exec.js
