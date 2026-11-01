export interface SubscriptionOptions { once?: boolean; signal?: AbortSignal }
export class Events<E extends { type: string }> {
  private listeners = new Map<string, Set<(event: E) => void>>();
  private disposers = new Set<() => void>();
  on(type: E['type'], handler: (event: E) => void, options: SubscriptionOptions = {}) {
    if (options.signal?.aborted) return () => {};
    const off = () => {
      this.listeners.get(type)?.delete(callback);
      options.signal?.removeEventListener('abort', off);
      this.disposers.delete(off);
    };
    const callback = (event: E) => { if (options.once) off(); handler(event); };
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(callback);
    this.disposers.add(off);
    options.signal?.addEventListener('abort', off, { once: true });
    return off;
  }
  emit(event: E) {
    for (const callback of [...this.listeners.get(event.type) ?? []]) {
      if (!this.listeners.get(event.type)?.has(callback)) continue;
      try { callback(event); } catch (error) { console.error('Zoomix listener', error); }
    }
  }
  clear() { for (const off of this.disposers) off(); this.listeners.clear(); }
}

// Shared by ESM and browser bundles in the same document.
const observerKey = Symbol.for('zoomix.observer.v1');
type Watcher = (records: MutationRecord[]) => void;
type SharedDocument = Document & { [observerKey]?: { observer: MutationObserver; callbacks: Set<Watcher> } };
export function watchDOM(callback: Watcher) {
  const doc = document as SharedDocument;
  let shared = doc[observerKey];
  if (!shared) {
    const callbacks = new Set<Watcher>();
    const observer = new MutationObserver(records => {
      for (const fn of [...callbacks]) {
        try { fn(records); } catch (error) { console.error('Zoomix lifecycle', error); }
      }
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
    shared = doc[observerKey] = { observer, callbacks };
  }
  shared.callbacks.add(callback);
  return () => {
    shared.callbacks.delete(callback);
    if (!shared.callbacks.size) { shared.observer.disconnect(); delete doc[observerKey]; }
  };
}
