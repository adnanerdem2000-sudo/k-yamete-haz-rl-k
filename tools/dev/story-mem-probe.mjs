// Hikâye senaryosunun ilk adımları (NPC, belgeler, santral, fener + 22:00 + fener yakınına ışınlanma) canlı döngüyle;
// 2 sn'de bir yığın/sahne/zombi/geometri/ses sayımı → hangi şey büyüyor? (renderer 7 GB'a çıkıp çöküyordu)
export default async ({ page, url, evalJS, log, wait }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await wait(1500);
  const snap = (label) => evalJS(page, (label) => {
    const g = window.__game, S = g.session, inf = g.gfx.renderer.info;
    const byName = {}; let objs = 0, maxKids = 0, maxKidsName = '';
    g.scene.traverse((o) => { objs++; const k = (o.name || o.type).split(/[:/]/)[0]; byName[k] = (byName[k] || 0) + 1; if (o.children.length > maxKids) { maxKids = o.children.length; maxKidsName = o.name || o.type; } });
    const top = Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ':' + v).join(' ');
    const avatars = []; for (const p of S.players.values()) if (p.avatar) avatars.push(p.avatar); if (S.local.avatar) avatars.push(S.local.avatar);
    let handKids = 0; for (const a of avatars) { let n = 0; a.root.traverse(() => n++); handKids = Math.max(handKids, n); }
    return { label, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, objs, top, maxKids: maxKids + ' ' + maxKidsName, avatarNodes: handKids, zombi: S.zombies.list.size, views: S.zombies.views.size, geos: inf.memory.geometries, tex: inf.memory.textures, progs: inf.programs ? inf.programs.length : null, bodies: g.phys.w.bodies.len(), loops: S.audio && S.audio.loops ? Object.keys(S.audio.loops).length : null, fps: g.gfx.fps, t: +S.t.toFixed(1), min: Math.round(S.time.minuteOfDay) };
  }, label);
  log('başlangıç', await snap('0'));
  await evalJS(page, () => {
    const S = window.__game.session;
    for (const id of ['aydin', 'ismail', 'zeynep', 'omer', 'necla', 'murat', 'defne']) S.npcs.byId(id);
    const before = { ...S.flags };
    for (const c of S.world.containers) { if (!['terminal', 'tower', 'radio', 'powerplant', 'prison_admin', 'hotel', 'keeper', 'vil_cafe', 'vil3', 'barn'].includes(c.building)) continue; S.loot.generate(c); }
    S.flags = before;
    S.act('quest_start', { id: 's_power' });
    S.giveLocal('engine_part', 1); S.giveLocal('wire', 3); S.giveLocal('electronics', 2);
    S.act('power_restore', {});
    S.quests.onInteract('dam_control');
  });
  log('santral sonrası', await snap('santral'));
  await wait(3000);
  log('+3 sn canlı', await snap('canli1'));
  await evalJS(page, () => {
    const S = window.__game.session;
    S.act('lighthouse_lit', {});
    S.act('flag', { flag: 'ship_contact', value: 1 });
    S.time.set(S.time.total + ((22 * 60) - S.time.minuteOfDay));
    S.local.spawnAt(-560, S.world.terrain.heightAt(-560, 520) + 0.2, 520, -2.4);
  });
  for (let i = 1; i <= 12; i++) { await wait(2500); log(`fener gece +${i * 2.5} sn`, await snap('f' + i)); }
};
