// Uçtan uca test koşucusu: kendi statik sunucusunu açar, senaryoları SIRAYLA çalıştırır (yazılım GPU'sunda
// aynı anda birden çok tarayıcı bellek yetmezliğiyle sekme çökertir), sonunda sunucuyu kapatır.
// Kullanım: node tools/e2e.mjs [ad ...]   (ad: tests/e2e/<ad>.mjs; boşsa hepsi)  · PORT=8090 ile port seçilir
// Her senaryonun tam çıktısı /tmp/e2e-<ad>.log dosyasına yazılır; özet tablo stdout'a basılır.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8090);
const URL_ = `http://localhost:${PORT}/`;
const all = fs.readdirSync(path.join(ROOT, 'tests/e2e')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort();
const names = process.argv.slice(2).length ? process.argv.slice(2) : all;

const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
const up = async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(URL_)).ok) return true; } catch { /* henüz açılmadı */ } await new Promise((r) => setTimeout(r, 100)); } return false; };
if (!(await up())) { console.error('sunucu açılmadı'); server.kill(); process.exit(2); }

const run = (name) => new Promise((resolve) => {
  const t0 = Date.now();
  const out = fs.createWriteStream(`/tmp/e2e-${name}.log`);
  const p = spawn(process.execPath, [path.join(ROOT, 'tools/scenario.mjs'), path.join(ROOT, 'tests/e2e', name + '.mjs'), URL_], { cwd: ROOT });
  let tail = '';
  const keep = (b) => { out.write(b); tail = (tail + b.toString()).slice(-4000); };
  p.stdout.on('data', keep); p.stderr.on('data', keep);
  p.on('close', (code) => {
    out.end();
    // başarısızlıkta denetim hataları özet satırının altına basılır (CI günlüğünde neden görünsün; tam çıktı /tmp/e2e-<ad>.log)
    const why = code !== 0 ? [...new Set(tail.split('\n'))].filter((l) => /^\[(assert|fatal|scenario-error|eval-error|p\d+:(?:pageerror|error))\]/.test(l)).slice(0, 8).map((l) => '    ' + l.slice(0, 400)) : [];
    resolve({ name, code, sec: Math.round((Date.now() - t0) / 1000), summary: (tail.match(/== (OK|HATA)[^\n]*/) || ['(özet yok)'])[0], why });
  });
});

const results = [];
for (const n of names) {
  if (!all.includes(n)) { results.push({ name: n, code: -1, sec: 0, summary: 'senaryo yok' }); continue; }
  const r = await run(n);
  results.push(r);
  console.log(`${r.code === 0 ? '✔' : '✘'} ${n.padEnd(18)} ${String(r.sec).padStart(4)} sn  ${r.summary}`);
  for (const l of r.why || []) console.log(l);
}
server.kill();
const bad = results.filter((r) => r.code !== 0);
console.log(`\n${results.length - bad.length}/${results.length} senaryo geçti${bad.length ? ' · başarısız: ' + bad.map((r) => r.name).join(', ') : ''}`);
process.exit(bad.length ? 1 : 0);
