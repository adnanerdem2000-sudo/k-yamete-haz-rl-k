# Mimari

## Genel bakış
Oyun, derleme adımı olmayan saf **ES modülleri** ile yazıldı (Three.js r187 + import map). Bu sayede depo,
herhangi bir statik sunucudan (GitHub Pages, githack, yerel `npm start`) doğrudan oynanabilir; ileride
Electron/Tauri ile `.exe` olarak paketlenebilir (bkz. `ROADMAP.md`).

```
main.js → Game (önyükleme, döngü, menü sahnesi)
            ├─ Graphics (renderer, kamera, bloom + renk derecelendirme, dinamik çözünürlük)
            ├─ Input (klavye/fare, işaretçi kilidi, tuş atamaları)  ├─ AudioManager (Web Audio: HRTF, oklüzyon, yankı, müzik)
            ├─ Assets (GLB kitleri, iskeletli modeller, sesler)     ├─ UIManager (menüler, HUD, paneller, zaman çizelgesi)
            ├─ World (arazi, binalar, yollar, çarpışma, yol bulma)   └─ Net (oda/lobi, taşıyıcılar, ses)
            ├─ PhysicsWorld (Rapier 3D: sabit 60 Hz adım, enterpolasyon, karakter denetleyicisi)
            └─ Session (oyun oturumu; tüm sistemler + StoryWorld + Timeline)
```

## Host-otoriter eylem/olay hattı (çok oyunculu çekirdek)
Tek oyunculu ve çok oyunculu oyun **aynı kod yolunu** kullanır:

1. Her durum değişikliği bir **eylem** olarak istenir: `session.act(type, payload)`.
2. Host eylemi doğrular (`session.on(type, handler)`) ve sonucu bir **olay** olarak üretir: `session.emit({k, ...})`.
3. Olay host'ta uygulanır (`session.onEvt(k, applier)`) ve ağ üzerinden tüm istemcilere yayınlanır.
   `to` alanı olan olaylar (ör. eşya verme) yalnızca hedef oyuncuya gider.
4. Tek oyunculu modda oyuncu kendi host'udur; ağ katmanı devre dışıdır.

Sürekli değişen durumlar (oyuncu/zombi/YZ arkadaş konumları, saat) **anlık görüntüler** ile eşitlenir:
istemci 15 Hz durum gönderir, host 10 Hz anlık görüntü yayınlar (zombiler oyuncu başına 150 m yarıçapında
süzülür). Aracı süren istemci, aracın fiziğinde otoritedir; host durumu diğerlerine aktarır.

## Modüller (spesifikasyondaki yöneticiler)
| Yönetici | Dosya |
|---|---|
| GameManager | `src/Game.js`, `src/Session.js` |
| PlayerController / CharacterManager | `src/entities/Player.js`, `Avatar.js`, `CharacterFactory.js`, `CharacterRig.js`, `Animations.js` |
| InventoryManager / ItemDatabase | `src/systems/Inventory.js`, `src/data/items.js` |
| CraftingManager | `src/systems/Crafting.js`, `src/data/recipes.js` |
| BuildingManager | `src/systems/Build.js`, `src/data/buildables.js` |
| VehicleManager | `src/systems/Vehicles.js` |
| ZombieAIManager / CombatManager | `src/systems/Zombies.js`, `src/systems/Combat.js`, `src/data/zombies.js` |
| QuestManager / EventManager | `src/systems/Quests.js`, `src/systems/Events.js`, `src/data/story.js` |
| TimeManager / WeatherManager | `src/systems/TimeSystem.js`, `src/systems/Weather.js`, `src/systems/Environment.js` |
| SaveManager | `src/systems/SaveSystem.js` |
| NetworkManager / VoiceChat | `src/net/Net.js`, `Transport.js`, `Voice.js` |
| UIManager / MapManager | `src/ui/*`, `src/systems/MapSystem.js` |
| AudioManager | `src/systems/AudioManager.js` |
| Endings / Results / Epilog | `src/systems/Endings.js` |
| AI Teammates | `src/systems/Bots.js` |
| PhysicsManager | `src/physics/PhysicsWorld.js`, `src/systems/PhysProps.js` |
| Story world (hikâyeye bağlı fiziksel/görsel nesneler) | `src/systems/StoryWorld.js` |
| Timeline (zaman çizelgesi) | `src/systems/Timeline.js`, `src/ui/Journal.js` (`renderTimeline`) |

## Dünya
- **Arazi:** 2048×2048 m dünya (ada + boğaz + anakara kıyısı), 4 m çözünürlüklü yükseklik alanı; 18 bölge
  platosu, göller, baraj gölü, dağlar, körfezli kıyı. `heightAt()` görsel üçgenlerle ve Rapier yükseklik
  alanıyla birebir aynı (ters köşegen) üçgenlemeyi kullanır.
- **Genişletilmiş bölgeler:** `src/world/RegionsExtra.js` (çiftlik, fener, tatil köyü, cezaevi, havaalanı,
  dağ köyü, baraj, köprü başı) prosedürel yapılar + etkileşim noktaları (fener lambası, santral paneli, uçak).
- **Binalar:** şablonlardan prosedürel üretilir (duvarlar, kapı/pencere boşlukları, iç kapılar, çatı,
  mobilya, yağma konteynerleri). İçeri girildiğinde çatı gizlenir. Kapı/pencere/cam paneller instanced çizilir.
- **Çarpışma ızgarası:** AABB/daire çarpıştırıcılar (yürünebilir zeminler, merdivenler, köprü karoları);
  her çarpıştırıcı Rapier'de statik bir kopya olarak aynalanır (açılan kapılar vb. eşzamanlı).
- **Fizik (Rapier 3D):** sabit 1/60 sn adım + çizimde enterpolasyon; oyuncu kapsülü kinematik karakter
  denetleyicisiyle (basamak, eğim, kayma), araçlar ışın tabanlı araç denetleyicisiyle (süspansiyon,
  tutunma sınırlı direksiyon, fren, devrilme önleyici); itilebilir/patlayan nesneler, enkaz, cesetler.
  Etkileşim grupları: STATIC, PLAYER, VEHICLE, PROP, DEBRIS, CORPSE. Fiziksel nesneler her istemcide yerel
  simüle edilir; oyunu etkileyen sonuçlar (ör. pist enkazının son pozu) eylem hattıyla eşitlenir.
- **Yol bulma:** 0,5 m'lik gezinme ızgarası + pencereli A*; kapı/pencere/yapı hücreleri "kırılabilir" sayılır,
  zombiler engeli kırarak yol açar.
- **Varlıklar:** CC0 modeller `tools/pack-assets.mjs` ile 7 GLB kitinde birleştirilir (~11 MB).

## Karakterler
İskeletli Quaternius insan tabanları (erkek/kadın, 62 kemikli CharacterArmature) bağlama pozunda tek bir
deri ağına birleştirilir; görünüm (ten, saç, kıyafet, kir) köşe renk yuvalarıyla boyanır, aksesuarlar
kemiklere bağlanır. Hareket: yürüme/koşma/yan/geri klipleri ortak fazlı karışımla, üstüne klip katmanları
(vuruş, takla, ölüm, el sallama) ve prosedürel tam gövde modları (eğilme, sürünme, tırmanma, yüzme, araç,
uyku) + ayak yerleştirme ve iki kemikli kol IK'sı. Ayak yere bastığında oturum zemine göre ayak sesi çalar.

## Hikâye, zaman çizelgesi ve hikâye dünyası
- `src/data/story.js`: takvim (30 gün), 45 olay (koşullar: gün aralığı, gece, `requires: flag:/noflag:/quest:/npc:`),
  14 NPC (selam, sohbet konuları `lore`, ticaret bayrağı), 29 görev, 38 belge, 7 final.
- `Events`: takvim etkileri + olay seçimlerinin etkileri (paket, düşen uçak, sarsıntı, Kanlı Ay, sürüler,
  hayvan sürüleri, yangın, gürültü, zula, enfeksiyon…). Hepsi host'ta uygulanır, olaylarla yayılır.
- `StoryWorld`: pist enkazları (Rapier ip eklemiyle araca bağlanıp çekilir), uçak kalkış sekansı, fener
  huzmesi (yumuşak hacimsel gölgelendirici), açıktaki gemi, paraşütlü paket, düşen uçak, sarsıntı,
  dinamik konteynerler. Durumu kayıtta ve istemci katılım paketinde saklanır.
- `Timeline`: her istemci olay akışından kronolojik bir çizelge tutar (takvim, yayın, olay kararı, görev,
  belge, NPC, keşif, sürü, tehlike, kurtarma, dünya değişiklikleri); host `post()` ile herkese kayıt düşer.

## Ses
Konumsal sesler HRTF panner'dan geçer; kazanç oyunun kendi mesafe eğrisiyle hesaplanır, mesafeyle tiz kaybı
için alçak geçiren süzgeç uygulanır, dinleyici ile kaynak arasında görüşü kesen yapı varsa (kare başına
sınırlı ışın) ses boğuklaşır. Efekt kanalı üretilmiş darbe yanıtlı bir konvolüsyon yankısına gönderilir;
iç mekânda gönderim artar. Müzik prosedüreldir; çatışma yoğunluğu yüksek kalınca CC0 savaş teması akış
olarak devreye girer.

## Kayıt
`Session.serialize()` tüm dünya durumunu (zaman, bayraklar, ilişkiler, konteynerler, yerdeki eşyalar,
yapılar, zombi bölgeleri, araçlar, NPC'ler, görevler, olaylar, harita sisi, hava, YZ arkadaşlar, kapı/pencere
durumları) ve oyuncuları **jeton** ile saklar. Çok oyunculuda istemcilerin envanteri 8 sn'de bir host'a
yedeklenir; oyuncu düşer ya da sonradan katılırsa eşyaları iade edilir. Kayıtlar `localStorage`'da
(otomatik + 3 yuva) tutulur, JSON olarak dışa/içe aktarılabilir.
