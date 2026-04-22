/* =============================================================
   gnoke-savenative.js
   A self-healing native file write library for mobile browsers.
   Part of the Gnoke Suite — Edmund Sparrow © 2026
   License: MIT
   v0.1.1 — Concurrency patch: per-file write queue + poison prevention
   ============================================================= */

export const saveNative = {

  // ── Lifecycle Hooks (optional UI layer) ──────────────────────
  onFlushProgress: null,   // (flushedCount, totalCount) => {}
  onFlushComplete: null,   // (recoveredCount) => {}
  onWriteFailure:  null,   // (name, err) => {}

  // ── Internal per-file queue map ──────────────────────────────
  _queues: {},


  // ── mount() ─────────────────────────────────────────────────
  // User-gesture: pick folder, stash handle in IndexedDB.
  async mount(openDB) {
    const handle = await window.showDirectoryPicker();
    const db = await this._db(openDB);
    await db.put('handles', handle, 'workspace');
    return handle;
  },


  // ── wake() ──────────────────────────────────────────────────
  // Restore handle after reload. Auto-flushes shelf silently.
  async wake(openDB) {
    const db     = await this._db(openDB);
    const handle = await db.get('handles', 'workspace');

    if (!handle) throw new Error('gnoke-savenative: No stashed handle. Call mount() first.');

    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      const req = await handle.requestPermission({ mode: 'readwrite' });
      if (req !== 'granted') throw new Error('gnoke-savenative: Permission denied on wake.');
    }

    await this._flush(handle, db);
    return { handle, db };
  },


  // ── write() ─────────────────────────────────────────────────
  // Serializes writes per filename. Prevents stale stream races.
  // Falls back to shelf on any failure. Queue-poison safe.
  write(workspace, name, content) {
    if (!content) return Promise.resolve(); // never shelf empty writes

    const prev = this._queues[name] || Promise.resolve();

    this._queues[name] = prev
      .then(() => this._doWrite(workspace, name, content))
      .catch(async () => {
        // Queue poison prevention — shelf on unchained error
        const { db } = workspace;
        await db.add('shelf', { name, content, createdAt: new Date().toISOString() });
      });

    return this._queues[name];
  },


  // ── _doWrite() (internal) ────────────────────────────────────
  // Executes a single native write. Shelves on failure.
  async _doWrite(workspace, name, content) {
    const { handle, db } = workspace;
    try {
      const file   = await handle.getFileHandle(name, { create: true });
      const stream = await file.createWritable();
      await stream.write(content);
      await stream.close();
    } catch (err) {
      if (this.onWriteFailure) this.onWriteFailure(name, err);
      await db.add('shelf', { name, content, createdAt: new Date().toISOString() });
    }
  },


  // ── _flush() (internal) ──────────────────────────────────────
  // FIFO drain of shelf. Called automatically by wake().
  async _flush(handle, db) {
    const pending = await db.getAll('shelf');
    if (!pending.length) return;

    let recovered = 0;

    for (const item of pending) {
      try {
        const file   = await handle.getFileHandle(item.name, { create: true });
        const stream = await file.createWritable();
        await stream.write(item.content);
        await stream.close();

        await db.delete('shelf', item.id);
        recovered++;

        if (this.onFlushProgress) {
          this.onFlushProgress(recovered, pending.length);
        }
      } catch (err) {
        // Leave item on shelf — handle still not ready.
        return;
      }
    }

    if (this.onFlushComplete) {
      this.onFlushComplete(recovered);
    }
  },


  // ── _db() (internal) ────────────────────────────────────────
  // Opens (or reuses) the ShadowStorage IndexedDB instance.
  async _db(openDB) {
    return openDB('ShadowStorage', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('handles')) {
          db.createObjectStore('handles');
        }
        if (!db.objectStoreNames.contains('shelf')) {
          db.createObjectStore('shelf', { keyPath: 'id', autoIncrement: true });
        }
      }
    });
  }

};

// CDN / browser global — allows plain <script src="..."> usage alongside ES module import
if (typeof window !== 'undefined') window.saveNative = saveNative;