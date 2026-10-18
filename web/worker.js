// Runs the Go engine (decryptid.wasm) off the main thread.
// Messages in: {id, req}; out: {id, resp} or {ready: true} / {fatal}.
importScripts('wasm_exec.js');

const go = new Go();
WebAssembly.instantiateStreaming(fetch('decryptid.wasm'), go.importObject)
  .then(({ instance }) => {
    go.run(instance); // registers self.decryptid, then waits for calls
    postMessage({ ready: true });
  })
  .catch((err) => postMessage({ fatal: String(err) }));

onmessage = (e) => {
  const { id, req } = e.data;
  let resp;
  try {
    resp = JSON.parse(self.decryptid(JSON.stringify(req)));
  } catch (err) {
    resp = { error: String(err) };
  }
  postMessage({ id, resp });
};
