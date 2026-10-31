# Mimari

## Genel bakış
Oyun, derleme adımı olmayan saf **ES modülleri** ile yazıldı (Three.js r187 + import map). Bu sayede depo,
herhangi bir statik sunucudan (GitHub Pages, githack, yerel `npm start`) doğrudan oynanabilir; ileride
Electron/Tauri ile `.exe` olarak paketlenebilir (bkz. `ROADMAP.md`).

```
main.js → Game (önyükleme, döngü, menü sahnesi)
            ├─ Graphics (renderer, kamera, bloom + renk derecelendirme, dinamik çözünürlük)
            ├─ Input (klavye/fare, işaretçi kilidi, tuş atamaları)  ├─ AudioManager (Web Audio, prosedürel müzik)
            ├─ Assets (GLB kitleri, sesler)                          ├─ UIManager (menüler, HUD, paneller)
            ├─ World (arazi, binalar, yollar, fizik, yol bulma)      └─ Net (oda/lobi, taşıyıcılar, ses)
            └─ Session (oyun oturumu; tüm sistemler)
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
| Endings / Results | `src/systems/Endings.js` |
| AI Teammates | `src/systems/Bots.js` |

## Dünya
- **Arazi:** 1280×1280 m ada, 4 m çözünürlüklü yükseklik alanı; bölge platoları, göl, dağ, kıyı.
  `heightAt()` görsel üçgenlerle birebir aynı enterpolasyonu kullanır.
- **Binalar:** şablonlardan prosedürel üretilir (duvarlar, kapı/pencere boşlukları, iç kapılar, çatı,
  mobilya, yağma konteynerleri). İçeri girildiğinde çatı gizlenir. Kapı/pencere/cam paneller instanced çizilir.
- **Fizik:** AABB/daire çarpışma ızgarası (yürünebilir zeminler, merdivenler, köprü karoları).
- **Yol bulma:** 0,5 m'lik gezinme ızgarası + pencereli A*; kapı/pencere/yapı hücreleri "kırılabilir" sayılır,
  zombiler engeli kırarak yol açar.
- **Varlıklar:** CC0 modeller `tools/pack-assets.mjs` ile 7 GLB kitinde birleştirilir (~11 MB).

## Karakterler
Kenney karakterleri tek bir iskelet/UV düzenini paylaşır. Görünüm (ten, saç, kıyafet, kir) çalışma anında
**doku boyanarak**, saç/şapka/gözlük/çanta gibi aksesuarlar kemiklere bağlı 3B parçalarla üretilir.
Animasyonlar klip yerine **prosedürel poz** sistemiyle (yürüme, koşma, eğilme, sürünme, tırmanma, yüzme,
araç, yere düşme, uyku, yakın dövüş, nişan, ifadeler) üretilir; kollar için iki kemikli IK vardır.

## Kayıt
`Session.serialize()` tüm dünya durumunu (zaman, bayraklar, ilişkiler, konteynerler, yerdeki eşyalar,
yapılar, zombi bölgeleri, araçlar, NPC'ler, görevler, olaylar, harita sisi, hava, YZ arkadaşlar, kapı/pencere
durumları) ve oyuncuları **jeton** ile saklar. Çok oyunculuda istemcilerin envanteri 8 sn'de bir host'a
yedeklenir; oyuncu düşer ya da sonradan katılırsa eşyaları iade edilir. Kayıtlar `localStorage`'da
(otomatik + 3 yuva) tutulur, JSON olarak dışa/içe aktarılabilir.
