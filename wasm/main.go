//go:build js && wasm

// Command wasm exposes the engine to JavaScript as one function:
// decryptid(requestJSON) -> responseJSON. See package api for requests.
package main

import (
	"syscall/js"

	"github.com/epsalon/decryptid/api"
)

func main() {
	js.Global().Set("decryptid", js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) != 1 {
			return `{"error":"decryptid takes one JSON string"}`
		}
		return string(api.Handle([]byte(args[0].String())))
	}))
	select {} // keep the Go runtime alive to serve calls
}
