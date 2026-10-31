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
  mobilya, yağma konteynerleri). Kapı/pencere/cam paneller instanced çizilir.
- **Statik birleştirme (çizim çağrısı):** bina kabukları malzeme + 512 m parça başına birleşir (parça sınırları
  256 m kaydırılmış: şehir tek parçaya düşer); iç yüzeyler (iç duvar, parke, fayans, halı) 64 m'lik hücrelerde
  birleşir ve `cullInteriors` 45 m ötesindekileri gizler. Çatılar da birleşiktir: her köşe binasının numarasını
  (`aRoof`) taşır, oyuncunun içinde olduğu binanın çatısı köşe gölgelendiricisinde kırpılır (`setRoofHidden`;
  gölge geçişi de aynı kuralla). Tabelalar tek doku atlasındadır (ışıklı dükkân tabelaları bir, ahşap yol
  levhaları bir çağrı; `signSpots` konumları tutar). Örneklenmiş kit modellerinde (`Instancer`) parçalar
  `src/core/PartMerge.js` ile birleşir: aynı malzemeli parçalar tek geometri; dokusuz düz renkli malzemeler
  (Kenney araçları) renk/pürüzlülük/metallik/ışıma köşe başına pişirilerek tek malzemede toplanır. İç mekân
  eşyaları 64 m'lik hücrelerde, 50 m ötede çizilmez. Model çeşitleri: `assets.parts(kit, ad, 'burnt')`
  (yanmış araç enkazı).
- **Çarpışma ızgarası:** AABB/daire çarpıştırıcılar (yürünebilir zeminler, merdivenler, köprü karoları);
  her çarpıştırıcı Rapier'de statik bir kopya olarak aynalanır (açılan kapılar vb. eşzamanlı).
- **Menteşeli kapılar (`physics/DoorPhysics`):** ahşap/metal/lab bina kapıları Rapier'de dinamik kanat gövdesi +
  dönel eklem (menteşe, açı sınırı). E ile aç/kapat eklem motorunu hedef açıya sürer; oyuncu yürüyerek iter
  (karakter denetleyicisi 80 kg itki), nesne/araç çarpınca savrulur, zombi yumruklayınca sarsılır (her
  istemcide görünüm durumundan). Kilitli/barikatlı kapı sabit gövde. Kırılınca eklem kopar, kanat düşer,
  uyuyunca gövde kaldırılır. Görsel kanadın gerçek dönüşümünden yazılır (açı ve çarpışma alanı birebir).
  Oyun tarafı AABB (yol bulma, görüş hattı, zombi engeli) kalır ama Rapier'e aynalanmaz. İterek açılan kapı
  0,35 sn sonra host'a `door` eylemi gönderir (kilitli değilse) → durum herkeste eşitlenir.
- **Su fiziği (`physics/Buoyancy`):** dinamik nesneler suya girince batan hacim oranında kaldırma kuvveti
  (yoğunluğa göre: ahşap/plastik/varil yüzer, cam batar), su direnci, hafif dalga ve doğrultucu tork.
- **Çarpışma sesleri (`physics/ContactSounds`):** Rapier temas kuvveti olayları (EventQueue) → nesnenin
  malzemesine (metal/ahşap/plastik/cam/gövde) ve şiddetine göre sentez ses (`AudioManager.impact`); gövde başına
  0,22 sn, adım başına en fazla 4 ses (yuvarlanan varil ses patlaması yapmaz).
- **Fizik (Rapier 3D):** sabit 1/60 sn adım + çizimde enterpolasyon; oyuncu kapsülü kinematik karakter
  denetleyicisiyle (basamak, eğim, kayma), araçlar ışın tabanlı araç denetleyicisiyle (süspansiyon,
  tutunma sınırlı direksiyon, fren, devrilme önleyici); itilebilir/patlayan nesneler, enkaz, cesetler.
  Etkileşim grupları: STATIC, PLAYER, VEHICLE, PROP, DEBRIS, CORPSE. Fiziksel nesneler her istemcide yerel
  simüle edilir; oyunu etkileyen sonuçlar (ör. pist enkazının son pozu) eylem hattıyla eşitlenir.
- **Yol bulma:** 0,5 m'lik gezinme ızgarası + pencereli A*; kapı/pencere/yapı hücreleri "kırılabilir" sayılır,
  zombiler engeli kırarak yol açar.
- **Varlıklar:** CC0 modeller `tools/pack-assets.mjs` ile 7 GLB kitinde birleştirilir (~11 MB).
- **Bitki örtüsü (`Vegetation`):** Quaternius Stylized Nature MegaKit (`tools/pack-nature.mjs` → `nature.glb`,
  4,3 MB): 59 model (ağaç, çalı, kaya, çim, eğrelti, çiçek, mantar, çakıl), yapraklar beyaz maske + doğal
  renk (sonbahar türleri aynı dokudan ton). ~105 bin örnek 64 m'lik hücrelerde; kamera hareket ettikçe
  bantlara dağıtılır: ağaçlar gölgeli tam model → gölgesiz tam model → uzak kart (impostor: yüklemede her
  ağaç modeli bir doku atlasına çizilir, uzak ağaç kameraya dönük tek dörtgen, tek çizim çağrısı). Bant
  mesafeleri grafik kalitesine bağlı (düşük/orta/yüksek). Rüzgâr salınımı köşe gölgelendiricisinde.
  Not: meshopt nicemlemesinde konumlar [-1,1] tamsayıdır (ölçek düğüm matrisinde); geometri dönüştürülmeden
  önce kayan noktaya çevrilir.
- **Yüzeyler (`Surfaces`, `tools/pack-textures.mjs`):** Downtown City MegaKit toprak/beton/asfalt/tuğla/arduvaz
  ve kaya dokuları "nötr ayrıntı"ya (gri, ortalama sabit) çevrilir; renk köşe renginden (palet) gelir, normal
  haritaları kabartma verir. Arazi: köşe başına katman ağırlıkları (çimen, toprak, kaya, beton) ve iki ölçekli
  örnekleme (tekrar deseni gizlenir); çimen katmanı prosedürel ot dokusu. Biyom renkleri sRGB doğal tonlar.
- **Ortam ışığı:** gökyüzü kubbesi + zemin diski 4 sn'de bir (ya da saat/hava değişince) PMREM ortam
  haritasına çizilir (`scene.environment`); yarımküre ışığı buna göre azaltılır.
- **Şehir kiti (`city.glb`, `tools/pack-city.mjs`):** Downtown City MegaKit hazır tuğla binaları (silüet, ön
  cephe en yakın yola döndürülür) ve donatı (klima, baba, saksı).
- **Kıyamet sonrası doku (`Dressing`):** prosedürel 12 hücreli iz atlası (yağ, çatlak, çöp, gazete, cam kırığı,
  yanık, fren izi, kuru leke, yaprak, kaldırım dibinde toprak, çakıl, yola boyanmış SOS) tek örnekli düzlemde
  (~4.600 iz, tek çizim çağrısı; `aCell` özniteliği atlas hücresini seçer). Kaldırım kenarı ve meydan
  çatlaklarında ot (bitki sistemi), kaldırımlarda ve çöp konteynerlerinin yanında prosedürel çöp torbası
  yığınları (tek çağrı, örnek başına renk), devrilmiş kutu/şişe. Duman sütunlarının altındaki kaza araçları
  yanmış enkazdır (`SMOKE_SITES`), çevrelerinde yanık/cam/yağ/çakıl izi. Yerleşim tohumlu RNG ile her istemcide
  aynı.
- **Yaşayan dünya (`LivingWorld`):** karga sürüleri (gürültüde ürker) ve duman sütunları; ikisi de tek
  örnekli ağ, animasyon gölgelendiricide. Sokak lambalarının ~%10'u yanmaz, ~%14'ü kesik kesik titrer
  (konuma göre deterministik; sprite rengi + ışık havuzu).
- **Taşınabilir nesneler:** hafif fizik nesneleri (≤ 20 kg) E ile alınır; gövde kinematiğe geçer ve oyuncu
  kapsülüyle çarpışmaz, önde taşınır (üst gövde Walk_Carry), E ile bırakılır, sol tıkla fırlatılır. Basamak
  inerken havada kalma, zıplama ve eğilme taşımayı bozmaz; yüzme, tırmanma, araç ve yatma bırakır. Görsel her
  karede taşıyanın fizik sonrası konumuna yerleşir (gecikmesiz), kinematik gövde bir adım arkadan gelir.
  **Çok oyunculu:** `prop_carry` eylemi host'ta doğrulanır (aynı nesneyi iki kişi alamaz; geç kalana gerçek
  taşıyıcı bildirilir, yerel iyimser alma geri alınır). Uzak oyuncunun taşıdığı nesne onun avatarının önünde
  izlenir; bırakma/fırlatma o anki poz ve hızla herkese gider, nesne durunca bırakanın gördüğü son konum
  (`prop_rest`) yeniden eşitlenir. Taşıyan oyundan çıkarsa nesne düşer.

## Karakterler
- **Modeller:** Quaternius "Ultimate Modular Men/Women" (CC0) — kafa/gövde/bacak/ayak kıyafet setleri tek
  62 kemikli iskelette (`tools/pack-characters.mjs` → `assets/models/rigged/men.glb`, `women.glb`).
  `CharacterFactory.ModularBase` parçaları bağlama pozunda doğrusal deri dönüşümüyle tek ağa birleştirir;
  karakter başına seçilen 4 parça sıkı bir geometride paylaşılır (kombinasyon önbelleği). Renk yuvaları
  (ten, saç, üst, alt, ayakkabı…) köşe renkleriyle boyanır; `null` yuva setin özgün rengini korur.
  Aksesuarlar (çanta, şapka, gözlük, dürbün, stetoskop…) kemik bağlantı noktalarına takılır ve yaylı
  sönümlü ikincil hareketle sallanır. Zombiler aynı hattan solmuş/kanlı kıyafetle üretilir.
- **Hareket kütüphanesi:** Quaternius "Universal Animation Library" 1+2 (CC0) — UE tipi iskelet için 154 klip,
  `tools/retarget-ual.mjs` + `tests/dev/retarget.html` ile oyunun iskeletine aktarılır: dünya uzayında dinlenme
  pozuna göre göreli dönüş, kalça çevirisi boy oranıyla, IK ayak kemikleri incik ucuna. Araç ayrıca her
  döngünün yürüyüş hızını (basan ayağın kayma hızı) ve faz başlangıcını (sol topuk basışı) ölçer. Klipler
  erkek/kadın iskeletleri için ayrı aktarılır (dinlenme pozları farklı). Paket biçimi `AnimPack` (.kan):
  16 bit nicemleme, iz içi fark kodlama, bayt ayrıştırma + gzip; 154 klip ≈ 590 KB (glTF ile 2,7 MB idi).
- **Animasyon denetleyicisi (`Motion`):** durumlar (ayakta/eğik/sürünme/yaralı/yüzme/merdiven/havada/sürüş/
  oturma) ağırlık sönümüyle karışır; döngüler ortak fazla örneklenir ve faz hızı gerçek hız / kliplerin
  ölçülmüş adım mesafesi ile ilerler (ayak kayması en aza iner). 8 yön karışımı (komşu iki yön), hıza göre
  yürüme ↔ koşu ↔ depar. Kişiliğe göre bekleme ve ara sıra kıpırdanma klipleri, yorgunken nefes nefese bekleme.
  Durum geçişlerinde yatma/kalkma/eğilme klipleri. Eylemler (`Avatar.playMotion`): maskeli tek seferlik klipler
  (tam/üst gövde/kollar), giriş/çıkış sönümü, döngü ve sonda bekleme (ölüm, uyku). Silah tutuş ve nişanları,
  taşınma pozu ve baş eğimi prosedürel katman (`CharacterRig`, kemik başına ağırlık) olarak üstte kalır.
  Kütüphane yüklenemezse eski klip + prosedürel düzen yedek olarak çalışır. Karakter başına güncelleme ~0,05 ms.
- **Zombiler (`ZombieView`):** aynı denetleyici zombi kümesiyle (bekleme/yürüme/koşu, tırmalama/ısırma, kapı
  yumruklama, isabet, ölüm, çığlık, yerden çıkış); türe göre oynatma hızı (şişko/iri ağır, koşucu seri) ve
  bireysel sapma; sürünenler sürünme klipleriyle. Zombi başına güncelleme ~0,03 ms.
- Ayak yere bastığında (faz 0 ve 0,5) oturum zemine göre ayak sesi çalar.

- **Yüz ve malzeme ayrıntısı:** göz merkezleri ve ağız yeri kafa setinin geometrisinden ölçülür (`combo.face`);
  göz akı + iris + göz bebeği + parıltı + kapak çizgisi + dudaklar tek ağda (karakter başına 1 çizim çağrısı,
  `buildFace`). Saç köklerden uçlara açılan ton ve tel tel fark; yüzde hafif ten varyasyonu. Deri malzemesi
  köşe başına pürüzlülük taşır (`aRough`: ten yarı mat, göz ıslak, kumaş mat, metal parlak) — tek malzeme.
- **Koleksiyonlar:** cinsiyete göre gerçek modüler set + renk/aksesuar (`COLLECTIONS.outfit.{men,women}`); yüz/saç
  korunur. Kafa × gövde setlerinin tümü boyun/bel boşluğu için ölçülür (`tools/dev/outfit-combos.mjs`).
- **Kişilik kıpırdanmaları (`Avatar.updateFidget`):** ayakta boş beklerken 12–26 sn'de bir 2,6–4,2 sn: Mert
  elindeki anahtarı kurcalar, Elif dürbünle tarar, Bora gerinir, Deniz gard alıp yumruk atar, Ceren saate
  bakar, Zülal ayak ucunda etrafı kolaçan eder (`Animations.fidget`, üst gövde maskesi, aletler eşya
  modelinden). Her istemci kendi zamanlamasıyla oynatır (kozmetik, ağ verisi yok).
- **Etkileşim hizası ve zaman çizelgesi:** etkileşimde oyuncu önce hedefe döner (`Player.faceTo`, hareket
  yoksa 0,5 sn); yerden alma eşyayı klibin eğilme anında (0,42 sn; yürürken 0,28) envantere ekler, kapı el kola
  değince (0,22 sn) hareket eder (`Interact.later`). Basılı tutmalı işler zaten bitişte uygulanır.
- **Modeller:** Quaternius "Ultimate Modular Men/Women" (CC0) — kafa/gövde/bacak/ayak kıyafet setleri tek
  62 kemikli iskelette (`tools/pack-characters.mjs` → `assets/models/rigged/men.glb`, `women.glb`).
  `CharacterFactory.ModularBase` parçaları bağlama pozunda doğrusal deri dönüşümüyle tek ağa birleştirir;
  karakter başına seçilen 4 parça sıkı bir geometride paylaşılır (kombinasyon önbelleği). Renk yuvaları
  (ten, saç, üst, alt, ayakkabı…) köşe renkleriyle boyanır; `null` yuva setin özgün rengini korur.
  Aksesuarlar (çanta, şapka, gözlük, dürbün, stetoskop…) kemik bağlantı noktalarına takılır ve yaylı
  sönümlü ikincil hareketle sallanır. Zombiler aynı hattan solmuş/kanlı kıyafetle üretilir.
- **Hareket kütüphanesi:** Quaternius "Universal Animation Library" 1+2 (CC0) — UE tipi iskelet için 154 klip,
  `tools/retarget-ual.mjs` + `tests/dev/retarget.html` ile oyunun iskeletine aktarılır: dünya uzayında dinlenme
  pozuna göre göreli dönüş, kalça çevirisi boy oranıyla, IK ayak kemikleri incik ucuna. Araç ayrıca her
  döngünün yürüyüş hızını (basan ayağın kayma hızı) ve faz başlangıcını (sol topuk basışı) ölçer. Klipler
  erkek/kadın iskeletleri için ayrı aktarılır (dinlenme pozları farklı). Paket biçimi `AnimPack` (.kan):
  16 bit nicemleme, iz içi fark kodlama, bayt ayrıştırma + gzip; 154 klip ≈ 590 KB (glTF ile 2,7 MB idi).
- **Animasyon denetleyicisi (`Motion`):** durumlar (ayakta/eğik/sürünme/yaralı/yüzme/merdiven/havada/sürüş/
  oturma) ağırlık sönümüyle karışır; döngüler ortak fazla örneklenir ve faz hızı gerçek hız / kliplerin
  ölçülmüş adım mesafesi ile ilerler (ayak kayması en aza iner). 8 yön karışımı (komşu iki yön), hıza göre
  yürüme ↔ koşu ↔ depar. Kişiliğe göre bekleme ve ara sıra kıpırdanma klipleri, yorgunken nefes nefese bekleme.
  Durum geçişlerinde yatma/kalkma/eğilme klipleri. Eylemler (`Avatar.playMotion`): maskeli tek seferlik klipler
  (tam/üst gövde/kollar), giriş/çıkış sönümü, döngü ve sonda bekleme (ölüm, uyku). Silah tutuş ve nişanları,
  taşınma pozu ve baş eğimi prosedürel katman (`CharacterRig`, kemik başına ağırlık) olarak üstte kalır.
  Kütüphane yüklenemezse eski klip + prosedürel düzen yedek olarak çalışır. Karakter başına güncelleme ~0,05 ms.
- **Zombiler (`ZombieView`):** aynı denetleyici zombi kümesiyle (bekleme/yürüme/koşu, tırmalama/ısırma, kapı
  yumruklama, isabet, ölüm, çığlık, yerden çıkış); türe göre oynatma hızı (şişko/iri ağır, koşucu seri) ve
  bireysel sapma; sürünenler sürünme klipleriyle. Zombi başına güncelleme ~0,03 ms.
- Ayak yere bastığında (faz 0 ve 0,5) oturum zemine göre ayak sesi çalar.

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
olarak devreye girer. Ortam: rüzgâr/yağmur/gündüz döngüleri, uzak siren ve 16–48 sn arayla 140–300 m ötede
rastgele yönde köpek, silah, çığlık, inilti ya da korna (sentez, yönlü ve süzgeçli; gürültü sistemine girmez).

## Kayıt
`Session.serialize()` tüm dünya durumunu (zaman, bayraklar, ilişkiler, konteynerler, yerdeki eşyalar,
yapılar, zombi bölgeleri, araçlar, NPC'ler, görevler, olaylar, harita sisi, hava, YZ arkadaşlar, kapı/pencere
durumları) ve oyuncuları **jeton** ile saklar. Çok oyunculuda istemcilerin envanteri 8 sn'de bir host'a
yedeklenir; oyuncu düşer ya da sonradan katılırsa eşyaları iade edilir. Kayıtlar `localStorage`'da
(otomatik + 3 yuva) tutulur, JSON olarak dışa/içe aktarılabilir.
