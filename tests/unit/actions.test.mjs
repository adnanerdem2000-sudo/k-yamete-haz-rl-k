// Etkileşim animasyonları birim testleri: basılı tutma (Interact.startHold) 'tür:çeşit' alır, kendi eylemini hatırlar
// ve bitince/iptalde yalnız onu bitirir; engel atlama/takla/zıplama/tırmanma tutmayı keser; konteyner yüksekliğine
// göre arama çeşidi (reachKind); üretim animasyonu (Crafting.animFor) ve iptalde üretim eyleminin bitmesi; balık
// tutma sonucu (makara sarma / boşa sarma) yalnız olta eylemine dokunur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Interact, LIDDED } from '../../src/systems/Interact.js';
import { Crafting } from '../../src/systems/Crafting.js';
import { NPCs } from '../../src/systems/NPCs.js';
import { RECIPE_BY_ID } from '../../src/data/recipes.js';

/** Avatar.play taklidi: her çağrı yeni eylem nesnesi üretir (gerçek avatardaki gibi) */
function fakeAvatar() {
  return { action: null, calls: [], play(type, dur, kind = null) { this.calls.push([type, dur, kind]); this.action = { type, dur, kind, loop: false }; } };
}
function fakeSession() {
  return {
    local: { pos: { x: 0, y: 10, z: 0 }, speed: 0, mode: 'ground', vault: null, roll: null, carrying: null, carryProp: null, avatar: fakeAvatar() },
    localStats: { downed: false, morale: 50 }, localProfile: { stats: {} }, world: { doors: [], windows: [], containers: [] },
    ui: { prompt: null, setPrompt(p) { this.prompt = p; }, toast() {} }, audio: { play() {} },
    on() {}, onEvt() {},
  };
}
const input = (down = true) => ({ isDown: () => down, wasPressed: () => false });
function interact(S) { const I = new Interact(S); I.findTarget = () => null; return I; }

test('basılı tutma: tür:çeşit ayrılır, kendi eylemini döngüye alır; bitince/iptalde yalnız onu bitirir', () => {
  const S = fakeSession(), I = interact(S), av = S.local.avatar;
  let done = 0;
  I.startHold('Aranıyor', 1, () => done++, 'search:chest');
  assert.deepEqual(av.calls[0], ['search', 1.3, 'chest']);
  assert.ok(I.hold.act === av.action && av.action.loop === true);
  I.startHold('Aranıyor', 1, () => done++); // çeşitsiz arama: yerde diz çökme
  assert.deepEqual(av.calls[1], ['search', 1.3, 'low']);
  // tutma sürerken başlayan başka eylem (yeme) tutma bitince kesilmez
  av.play('consume', 2);
  const eat = av.action;
  for (let i = 0; i < 12 && I.hold; i++) I.update(0.1, input(true), false);
  assert.equal(done, 1);
  assert.equal(av.action, eat, 'arada başlayan yeme sürmeli');
  // kendi eylemi bitince temizlenir
  I.startHold('Yakıt dolduruluyor', 0.5, () => done++, 'search:pour');
  assert.deepEqual(av.calls.at(-1), ['search', 0.8, 'pour']);
  for (let i = 0; i < 8 && I.hold; i++) I.update(0.1, input(true), false);
  assert.equal(done, 2);
  assert.equal(av.action, null);
  // iptal (E bırakıldı): kendi eylemi biter; araya başka eylem girdiyse ona dokunulmaz
  I.startHold('Zorlanıyor', 3, () => done++, 'push');
  I.update(0.1, input(false), false);
  assert.equal(I.hold, null);
  assert.equal(av.action, null);
  I.startHold('Zorlanıyor', 3, () => done++, 'push');
  av.play('drink', 2);
  const dr = av.action;
  I.cancelHold();
  assert.equal(av.action, dr);
  assert.equal(done, 2, 'iptal edilen tutma tamamlanmaz');
});

test('basılı tutma: engel atlama, takla, zıplama/düşme, tırmanma ve yürüme tutmayı keser (atlamada hız donuk kalsa da)', () => {
  const cases = { vault: (pl) => { pl.vault = { t: 0 }; }, roll: (pl) => { pl.roll = { t: 0 }; }, air: (pl) => { pl.mode = 'air'; }, climb: (pl) => { pl.mode = 'climb'; }, walk: (pl) => { pl.speed = 1; } };
  for (const [name, set] of Object.entries(cases)) {
    const S = fakeSession(), I = interact(S);
    let done = 0;
    I.startHold('Aranıyor', 0.5, () => done++, 'search', true);
    I.update(0.1, input(true), false);
    assert.ok(I.hold, name + ': dururken sürer');
    set(S.local);
    for (let i = 0; i < 8; i++) I.update(0.1, input(true), false);
    assert.equal(I.hold, null, name);
    assert.equal(done, 0, name + ': tamamlanmamalı');
    assert.equal(S.local.avatar.action, null, name + ': arama eylemi bitmeli');
  }
});

test('konteyner arama çeşidi yüksekliğe göre: yerde diz çökme, kapaklıda eğilme, tezgâhta, yüksekte uzanma', () => {
  const I = interact(fakeSession()); // ayak yüksekliği 10
  assert.equal(I.reachKind({ y: 10.3 }), 'low'); // yerdeki çanta
  assert.equal(I.reachKind({ y: 11 }, true), 'chest'); // sandık, çöp konteyneri
  assert.equal(I.reachKind({ y: 11 }), 'mid');
  assert.equal(I.reachKind({ y: 10.5, fy: 10, fh: 0.5 }), 'low'); // komodin (çerçeve 0,5 m)
  assert.equal(I.reachKind({ y: 10.9, fy: 10, fh: 0.9 }), 'mid'); // mutfak dolabı
  assert.equal(I.reachKind({ y: 11.2, fy: 10, fh: 2.0 }), 'high'); // gardırop: y en çok zemin + 1,2, çerçeveye bakılır
  assert.ok(LIDDED.has('crate') && LIDDED.has('dumpster') && LIDDED.has('car_trunk') && !LIDDED.has('wardrobe') && !LIDDED.has('fridge'));
});

test('üretim animasyonu tarife göre; iptalde yalnız üretimin kendi eylemi biter', () => {
  const S = fakeSession();
  const C = new Crafting(S);
  const A = (id) => C.animFor(RECIPE_BY_ID[id]);
  assert.equal(A('cooked_meat'), 'search:low', 'kamp ateşinde diz çökme');
  S.world.containers.push({ type: 'stove', x: 1.5, z: 1 });
  assert.equal(A('cooked_meat'), 'search:mid', 'ocak başında tezgâh hizası');
  assert.equal(A('metal_sheet'), 'hammer');
  assert.equal(A('spiked_bat'), 'hammer', 'çivi çakma');
  assert.equal(A('plank'), 'chop', 'baltayla tahta kesme: odun yarma klibi');
  assert.equal(A('axe'), 'search:mid', 'tezgâhta');
  assert.equal(A('bandage'), 'search:hands', 'elde');
  assert.equal(A('filter_water'), 'search:pour');
  // craft(): animasyon çeşidiyle başlar; iptal yalnız kendi eylemini bitirir
  S.inventory = { remove() { return 1; }, slots: [], changed() {} };
  S.giveLocal = () => {};
  let cancel = null;
  S.ui.progress = (label, dur, onDone, onCancel) => { cancel = onCancel; };
  C.check = () => ({ ok: true });
  const av = S.local.avatar;
  assert.ok(C.craft('plank'));
  assert.equal(av.calls.at(-1)[0], 'chop');
  cancel();
  assert.equal(av.action, null, 'iptalde üretim eylemi biter');
  assert.ok(C.craft('bandage'));
  assert.deepEqual([av.calls.at(-1)[0], av.calls.at(-1)[2]], ['search', 'hands']);
  av.play('consume', 2);
  const eat = av.action;
  cancel();
  assert.equal(av.action, eat, 'arada başlayan eylem sürer');
});

test('balık tutma sonucu: tutulunca makara sarma, kaçınca boşa sarma klibi; yalnız olta eylemine dokunulur', () => {
  const mk = () => {
    const S = fakeSession();
    S.inventory = { has: () => true, remove() {}, slots: [] };
    S.giveLocal = () => {};
    let pressed = false;
    S.game = { input: { wasPressed: () => pressed } };
    const N = Object.create(NPCs.prototype);
    N.s = S; N.fishing = null;
    return { S, N, press: (v) => { pressed = v; } };
  };
  // tutuldu
  let { S, N, press } = mk();
  N.startFishing({ water: 'lake' });
  assert.ok(S.local.avatar.action.type === 'fish' && S.local.avatar.action.loop, 'olta beklerken döngüde');
  N.fishing.bite = 0.1;
  N.updateFishing(0.2);
  press(true);
  N.updateFishing(0.05);
  assert.equal(N.fishing, null);
  assert.deepEqual(S.local.avatar.calls.at(-1), ['fish', 2.0, 'reel']);
  // kaçtı (süre doldu)
  ({ S, N, press } = mk());
  N.startFishing({ water: 'sea' });
  N.fishing.bite = 0.1;
  N.updateFishing(0.2); N.updateFishing(2.0);
  assert.equal(N.fishing, null);
  assert.deepEqual(S.local.avatar.calls.at(-1), ['fish', 2.2, 'fail']);
  // beklerken başlayan yeme: sonuç klibi yemeyi kesmez
  ({ S, N, press } = mk());
  N.startFishing({ water: 'lake' });
  S.local.avatar.play('consume', 2);
  const eat = S.local.avatar.action;
  N.fishing.bite = 0.1;
  N.updateFishing(0.2); N.updateFishing(2.0);
  assert.equal(S.local.avatar.action, eat);
  // yürüyünce iptal: olta eylemi biter
  ({ S, N, press } = mk());
  N.startFishing({ water: 'lake' });
  S.local.speed = 1;
  N.updateFishing(0.1);
  assert.equal(N.fishing, null);
  assert.equal(S.local.avatar.action, null);
});
