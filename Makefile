# Web build: the Go engine as WebAssembly plus Go's JS glue, into web/.
WEB := web
NODE ?= node
PORT ?= 8347

.PHONY: web serve test smoke e2e clean check-wasm-deps

web:
	GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o $(WEB)/decryptid.wasm ./wasm
	cp "$$(go env GOROOT)/lib/wasm/wasm_exec.js" $(WEB)/wasm_exec.js

serve: web
	python3 -m http.server --bind 127.0.0.1 -d $(WEB) $(PORT)

test:
	go test ./...

smoke: web
	$(NODE) $(WEB)/test/smoke.mjs

clean:
	rm -f $(WEB)/decryptid.wasm $(WEB)/wasm_exec.js

# Browser tests: needs node, plus `npm install` and `npx playwright install
# chromium` in web/test once.
e2e: web
	cd $(WEB)/test && $(NODE) e2e.mjs

# The web build must link only the Go standard library: web/THIRD_PARTY_NOTICES.txt
# lists Go's license and honeycomb's, nothing else. Update it if this fails.
check-wasm-deps:
	@deps=$$(GOOS=js GOARCH=wasm go list -deps -f '{{if .Module}}{{.Module.Path}}{{end}}' ./wasm | sort -u | grep -v '^github.com/epsalon/decryptid$$'); \
	if [ -n "$$deps" ]; then echo "wasm build links third-party modules (update THIRD_PARTY_NOTICES.txt):"; echo "$$deps"; exit 1; fi; \
	echo "wasm build links only the Go standard library"
