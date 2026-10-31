// Basit yayın/abone sistemi. Sistemler birbirine doğrudan bağlanmak yerine olaylarla haberleşir.
export class EventBus {
  constructor() { this.map = new Map(); }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }
  once(type, fn) { const off = this.on(type, (...a) => { off(); fn(...a); }); return off; }
  off(type, fn) { const s = this.map.get(type); if (s) s.delete(fn); }
  emit(type, payload) {
    const s = this.map.get(type);
    if (!s) return;
    for (const fn of [...s]) {
      try { fn(payload); } catch (e) { console.error(`[EventBus] "${type}" dinleyicisi hata verdi:`, e); }
    }
  }
  clear() { this.map.clear(); }
}
