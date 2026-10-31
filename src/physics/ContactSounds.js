// Çarpışma sesleri: Rapier temas kuvveti olaylarından (EventQueue) nesnenin malzemesine ve çarpma şiddetine
// göre ses. Cam, metal, ahşap, beton/zemin ve plastik ayrı tınlar; aynı gövdeden art arda gelen temaslar
// (yerde yuvarlanan varil) bastırılır, kare başına en fazla birkaç ses çalar.
const MIN_FORCE = 40; // N·s/adım ölçeğinde eşik (Rapier toplam kuvvet)
const PER_BODY = 0.22; // aynı gövdeden iki ses arası en az süre (sn)
const MAX_PER_STEP = 4;

export class ContactSounds {
  constructor(phys, audio) {
    this.phys = phys;
    this.getAudio = typeof audio === 'function' ? audio : () => audio;
    this.R = phys.R;
    this.queue = new this.R.EventQueue(true);
    this.last = new Map(); // body handle → son ses zamanı
    this.time = 0;
    this.count = 0; // alınan temas olayı (tanı)
    phys.eventQueue = this.queue; // PhysicsWorld.update adımda bu kuyruğu kullanır
    this.off = phys.addAfter((h) => this.drain(h));
  }
  dispose() { if (this.off) this.off(); if (this.phys.eventQueue === this.queue) this.phys.eventQueue = null; this.queue.free && this.queue.free(); }

  /** Dinamik nesneyi kaydet: material: metal|wood|glass|plastic|body|concrete */
  register(d, material = 'wood') {
    d.material = material;
    d.col.setActiveEvents(this.R.ActiveEvents.CONTACT_FORCE_EVENTS);
    d.col.setContactForceEventThreshold(MIN_FORCE);
  }

  drain(h) {
    this.time += h;
    let n = 0;
    this.queue.drainContactForceEvents((ev) => {
      this.count++;
      if (n >= MAX_PER_STEP) return;
      const c1 = this.phys.w.getCollider(ev.collider1()), c2 = this.phys.w.getCollider(ev.collider2());
      const d1 = c1 && this.phys.dynamicAt(c1), d2 = c2 && this.phys.dynamicAt(c2);
      const d = d1 && d1.material ? d1 : d2 && d2.material ? d2 : null;
      if (!d || d.inWater) return; // sudaki nesnelerin dip teması ses değil
      const f = ev.totalForceMagnitude();
      const key = d.body.handle;
      const last = this.last.get(key) || -1;
      if (this.time - last < PER_BODY) return;
      // şiddet: eşiğin katı (0..1), kütleyle normalize (ağır nesne daha gür)
      const mass = Math.max(1, d.body.mass());
      const sev = Math.min(1, (f / MIN_FORCE - 1) / 14);
      if (sev < 0.03) return;
      this.last.set(key, this.time);
      const t = d.body.translation();
      const other = d === d1 ? d2 : d1;
      const vs = other && other.material ? other.material : 'ground';
      const audio = this.getAudio();
      if (audio && audio.impact) audio.impact(d.material, sev, { x: t.x, y: t.y, z: t.z }, mass, vs);
      n++;
    });
  }
}
