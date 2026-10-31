// Hikâye 'fener' adımı çökme bisect'i: DISABLE=doorPhys,drawers,living,contacts,buoyancy,lamps,fidget,vegetation
// ile alt sistemler kapatılır; fener adımı (atomik: fener + bayrak + 22:00 + ışınlanma) → 1,5 sn canlı → pause +
// 90 adım → sabit kare → ekran görüntüsü; aralarda renderer RSS örneklenir. Çökmezse RSS düz kalmalı.
import { execSync } from 'node:child_process';
export default async ({ page, url, shot, wait, evalJS, log }) => {
  const S = (fn, arg) => evalJS(page, fn, arg);
  const rss = () => { try { const out = execSync("ps -eo rss,args | grep -- '--type=renderer' | grep -v grep | sort -rn | head -1").toString().trim(); return Math.round(parseInt(out, 10) / 1024); } catch { return -1; } };
  const mark = (label) => log('RSS ' + label, rss());
  const disable = (process.env.DISABLE || '').split(',').filter(Boolean);
  log('kapalı', disable);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await S(() => { window.__game.ui.menus.opts.ai = 0; return window.__game.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await S((dis) => {
    const g = window.__game, S = g.session, noop = () => {};
    if (dis.includes('doorPhys') && S.doorPhys) S.doorPhys.update = noop;
    if (dis.includes('drawers') && S.drawers) S.drawers.update = noop;
    if (dis.includes('living') && S.living) for (const l of Object.values(S.living)) l.update = noop;
    if (dis.includes('contacts') && S.contacts) S.contacts.drain = noop;
    if (dis.includes('buoyancy') && S.buoyancyOff) { S.buoyancyOff(); S.buoyancyOff = null; }
    if (dis.includes('lamps')) S.env.updateLamps = noop;
    if (dis.includes('wet')) S.env.applyWetness = noop;
    if (dis.includes('vegetation')) S.world.vegetation.update = noop;
    if (dis.includes('zombies')) S.zombies.update = noop;
    if (dis.includes('audio') && S.audio) { S.audio.update = noop; S.audio.play = noop; S.audio.loop = noop; S.audio.impact = noop; S.audio.stopLoop = noop; }
    if (dis.includes('interact') && S.interact) S.interact.update = noop;
    if (dis.includes('props') && S.props) S.props.update = noop;
    if (dis.includes('phys') && g.phys) g.phys.update = () => 0;
    if (dis.includes('ui') && g.ui) g.ui.update = noop;
    if (dis.includes('env') && S.env) S.env.update = noop;
    if (dis.includes('npcs') && S.npcs) S.npcs.update = noop;
    if (dis.includes('vehicles') && S.vehicles) S.vehicles.update = noop;
    if (dis.includes('story') && S.storyWorld) S.storyWorld.update = noop;
    if (dis.includes('cull')) { S.world.cullInteriors = noop; S.world.instancer.cull = noop; S.updateRoofs = noop; }
    if (dis.includes('player') && S.local) { S.local.update = noop; S.local.postPhysics = noop; }
    if (dis.includes('bots') && S.bots) S.bots.update = noop;
    if (dis.includes('fx') && S.fx) S.fx.update = noop;
    if (dis.includes('weather') && S.weather) S.weather.update = noop;
    if (dis.includes('events') && S.events) S.events.update = noop;
    if (dis.includes('fidget')) { for (const p of S.players.values()) if (p.avatar && p.avatar.updateFidget) p.avatar.updateFidget = noop; if (S.local.avatar) S.local.avatar.updateFidget = noop; }
    window.__pause = () => { cancelAnimationFrame(g.raf); g.raf = 0; };
    window.__step = (frames) => { const inp = g.input; for (let i = 0; i < frames; i++) { inp.down.clear(); S.update(1 / 60); inp.endFrame(); } };
    window.__still = (pos, look) => { const c = g.gfx.camera; document.getElementById('ui-root').style.display = 'none'; c.position.set(pos[0], pos[1], pos[2]); c.lookAt(look[0], look[1], look[2]); S.world.vegetation.update(c.position, g.settings.get('graphics.viewDistance'), true, 1, g.settings.get('graphics.quality')); g.env.update(0.016, g.time, S.time.minuteOfDay, c.position, S.region); g.gfx.render(0.016, g.time); };
  }, disable);
  await wait(1500);
  mark('başlangıç');
  if (process.env.PREFIX) {
    await S(() => { const S = window.__game.session; for (const id of ['aydin', 'ismail', 'zeynep', 'omer', 'necla', 'murat', 'defne']) S.npcs.byId(id); S.world.buildingById.hotel.floorY; });
    mark('npc');
    await S(() => { const S = window.__game.session; const before = { ...S.flags }; for (const c of S.world.containers) { if (!['terminal', 'tower', 'radio', 'powerplant', 'prison_admin', 'hotel', 'keeper', 'vil_cafe', 'vil3', 'barn'].includes(c.building)) continue; S.loot.generate(c); } S.flags = before; });
    mark('belgeler');
  }
  await S(() => { const S = window.__game.session; S.act('quest_start', { id: 's_power' }); S.giveLocal('engine_part', 1); S.giveLocal('wire', 3); S.giveLocal('electronics', 2); S.act('power_restore', {}); S.quests.onInteract('dam_control'); });
  mark('santral');
  await S(() => { const S = window.__game.session; S.act('lighthouse_lit', {}); S.act('flag', { flag: 'ship_contact', value: 1 }); S.time.set(S.time.total + ((22 * 60) - S.time.minuteOfDay)); S.local.spawnAt(-560, S.world.terrain.heightAt(-560, 520) + 0.2, 520, -2.4); });
  mark('fener atomik');
  for (let i = 1; i <= 3; i++) { await wait(500); mark(`canlı +${i * 0.5} sn`); }
  await S(() => { window.__pause(); window.__step(90); });
  mark('pause+90');
  await S(() => { const L = window.__game.session.world.lighthouse; window.__still([L.x + 70, L.y + 6, L.z - 60], [L.x, L.y - 4, L.z]); });
  mark('still');
  await shot(page, '/tmp/crash-bisect.png');
  mark('shot');
  await wait(3000); mark('+3 sn');
};
