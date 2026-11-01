// Çok oyunculu taşıyıcı birim testleri (Aşama 7): ICE/TURN listesi temizliği (kimlik bilgisi zorunluluğu, şema
// filtresi, yapılandırma kaynakları), yerel taşıyıcı el sıkışması/veri/kapanış (Node'un BroadcastChannel'ı), aynı kodla
// ikinci host reddi, dünyasını kuran eşe uzun zaman aşımı.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// tarayıcı nesneleri için en küçük taklitler (LocalTransport sekme kapanışını dinler; iceServers yapılandırma okur)
const store = new Map();
globalThis.window = globalThis.window || { addEventListener() {}, removeEventListener() {} };
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.location = globalThis.location || { search: '' };
const { LocalTransport, PeerTransport, sanitizeIce } = await import('../../src/net/Transport.js');
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('sanitizeIce: yalnız stun/turn şemaları; TURN için kullanıcı adı + parola zorunlu', () => {
  const out = sanitizeIce([
    { urls: 'stun:stun.example.org:3478' },
    { urls: 'turn:turn.example.org:3478', username: 'u', credential: 'p' },
    { urls: 'turn:turn.example.org:3478' },
    { urls: 'turn:turn.example.org:3478', username: 'u' },
    { urls: 'http://evil.example.org' },
    { urls: ['turns:a.example.org:5349', 'javascript:alert(1)'], username: 'u', credential: 'p' },
    null, 42, { foo: 1 },
  ]);
  assert.deepEqual(out, [{ urls: 'stun:stun.example.org:3478' }, { urls: 'turn:turn.example.org:3478', username: 'u', credential: 'p' }]);
  assert.equal(sanitizeIce('x'), null);
  assert.deepEqual(sanitizeIce([]), []);
});

test('iceServers: varsayılan yalnız genel STUN (koda gömülü TURN/kimlik yok); window → localStorage → ?ice= sırası', () => {
  delete window.KIYAMET_ICE; store.clear(); location.search = '';
  const base = PeerTransport.iceServers();
  assert.ok(base.length >= 1 && base.every((s) => /^stun:/.test(s.urls) && !s.username && !s.credential), 'varsayılan liste yalnız STUN');
  localStorage.setItem('kiyamet.net.ice', JSON.stringify([{ urls: 'turn:t.example.org:3478', username: 'a', credential: 'b' }]));
  assert.equal(PeerTransport.iceServers().length, base.length + 1);
  window.KIYAMET_ICE = [{ urls: 'turns:w.example.org:5349', username: 'w', credential: 'x' }, { urls: 'ftp://x' }];
  const w = PeerTransport.iceServers();
  assert.equal(w[w.length - 1].urls, 'turns:w.example.org:5349', 'window.KIYAMET_ICE önceliklidir, geçersiz girdi atılır');
  assert.equal(w.length, base.length + 1);
  delete window.KIYAMET_ICE; store.clear();
  location.search = '?ice=' + encodeURIComponent('bozuk json');
  assert.deepEqual(PeerTransport.iceServers(), base, 'bozuk yapılandırma yok sayılır');
  location.search = '';
});

test('LocalTransport: bağlanma, iki yönlü veri ve host kapanışı ("closed")', async () => {
  const code = 'T' + Math.random().toString(36).slice(2, 8);
  const host = new LocalTransport();
  const opened = [], got = [];
  host.onPeerOpen = (pid) => opened.push(pid);
  host.onPeerData = (pid, m) => got.push([pid, m]);
  await host.startHost(code);
  const cli = new LocalTransport();
  const fromHost = [];
  let closed = null;
  cli.onHostData = (m) => fromHost.push(m);
  cli.onHostClose = (r) => { closed = r; };
  await cli.connect(code);
  await tick();
  assert.equal(opened.length, 1, 'host istemciyi görmeli');
  cli.sendHost({ t: 'hello', n: 1 });
  host.send(opened[0], { t: 'welcome' });
  await tick(60);
  assert.deepEqual(got.map(([, m]) => m.t), ['hello']);
  assert.deepEqual(fromHost.map((m) => m.t), ['welcome']);
  host.close();
  await tick(60);
  assert.equal(closed, 'closed', 'host kapanınca istemci kesin kayıp ("closed") almalı');
  cli.close();
});

test('LocalTransport: aynı oda koduyla ikinci host reddedilir', async () => {
  const code = 'D' + Math.random().toString(36).slice(2, 8);
  const a = new LocalTransport();
  await a.startHost(code);
  const b = new LocalTransport();
  await assert.rejects(() => b.startHost(code), (e) => e.type === 'unavailable-id');
  a.close(); b.close();
});

test('LocalTransport: zaman aşımı eşe göre (dünyasını kuran eş düşürülmez)', async () => {
  const code = 'Z' + Math.random().toString(36).slice(2, 8);
  const host = new LocalTransport();
  const opened = [], dropped = [];
  host.onPeerOpen = (pid) => opened.push(pid);
  host.onPeerClose = (pid) => dropped.push(pid);
  await host.startHost(code);
  const slow = new LocalTransport(), fast = new LocalTransport();
  await slow.connect(code); await fast.connect(code);
  await tick();
  assert.equal(opened.length, 2);
  // ikisi de susar (kalp atışı durdurulur); 'loading' eşe uzun süre tanınır
  clearInterval(slow._hb); clearInterval(fast._hb);
  const loading = opened[0];
  host.timeoutFor = (pid) => (pid === loading ? 1e9 : 50);
  await tick(1700); // host'un denetim aralığı 1,5 sn
  assert.deepEqual(dropped, [opened[1]], 'yalnız sıradan eş düşürülmeli');
  host.close(); slow.close(); fast.close();
});

test('LocalTransport: kapanışını duyuran host yeni bağlantı kabul etmez (ölmekte olan host\'a yeniden katılma yok)', async () => {
  const code = 'C' + Math.random().toString(36).slice(2, 8);
  const host = new LocalTransport();
  await host.startHost(code);
  const old = new LocalTransport();
  let reason = null;
  old.onHostClose = (r) => { reason = r; };
  await old.connect(code);
  host._unload(); // sekme kapanıyor (beforeunload)
  await tick(60);
  assert.equal(reason, 'closed', 'bağlı istemci kesin kayıp almalı');
  const late = new LocalTransport();
  const p = late.connect(code).then(() => 'kabul', () => 'red');
  await tick(400);
  assert.equal(late.hostId, null, 'kapanış süresinde yeni istemci kabul edilmemeli');
  // yeni host aynı kodu alabilmeli (kapanan host yoklamaya "buradayım" demez)
  const next = new LocalTransport();
  await next.startHost(code);
  assert.ok(next.isHost);
  host.close(); old.close(); next.close();
  late.close();
  void p;
});
