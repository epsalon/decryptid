// Promise API over the engine worker. See package api for the operations.

export class Engine {
  constructor(url = 'worker.js') {
    this.worker = new Worker(url);
    this.nextId = 1;
    this.pending = new Map(); // id -> {resolve, reject}
    this.latestByKey = new Map(); // key -> id of the newest request
    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = (e) => {
        const m = e.data;
        if (m.ready) return resolve();
        if (m.fatal) return reject(new Error(m.fatal));
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        if (m.resp.error) p.reject(new Error(m.resp.error));
        else p.resolve(m.resp.result);
      };
    });
  }

  // call runs one operation, e.g. call('summary', {game}).
  async call(op, args = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, req: { op, ...args } });
    });
  }

  // latest is call, but resolves to undefined if another request with the
  // same key was made in the meantime, so a slow stale answer never
  // overwrites a newer one.
  async latest(key, op, args) {
    const ticket = {};
    this.latestByKey.set(key, ticket);
    const result = await this.call(op, args);
    return this.latestByKey.get(key) === ticket ? result : undefined;
  }
}
