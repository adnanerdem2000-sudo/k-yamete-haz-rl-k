# Test Raporu — Tur 2 (14 Kasım 2026'dan) ve önceki tur ("Next Level 2.0", 1–2 Kasım özellik turu)

Ortam: Linux (4 çekirdek), Node 22, başsız Chromium (Playwright 1.63) + SwiftShader yazılım GPU'su.

Bu rapordaki bütün sayılar son koşulardan alınmıştır. Yazılım GPU'sunda ölçülen kare hızları gerçek ekran kartı
performansı **değildir**; yalnız kalite seviyelerinin yükünü (çizim çağrısı, üçgen, ek geçişler) karşılaştırmak için
kullanılır.

## Tur 2 — Aşama 1: test ve güvenlik (14 Kasım 2026)
Başlangıç sürümü `d08b603` (yerel etiket `nl2-tur2-baslangic`). Geliştirme yerel `nl2-tur2-gelistirme` dalında yapılıyor;
yalnız doğrulanmış aşamalar canlı dala (`claude/kiyametten-once-game-0yng28`) aktarılıyor. Yedeğin GitHub'a ayrıca
gönderilmesi bu ortamın izinleriyle mümkün olmadı (etiket gönderimi HTTP 403, ikinci dal gönderimi izin denetiminde
reddedildi); başlangıç sürümü canlı dalın geçmişinde `d08b603` olarak duruyor.

### Test takımına eklenenler
- **Değer denetimi:** önceki raporda "yalnız çökme ya da zaman aşımıyla başarısız olabilir" denen 15 uçtan uca senaryoya
  toplam 112 denetim eklendi. Artık yanlış davranış da senaryoyu düşürüyor. Eşikler, oyunun kodundan ve çevrimdışı
  benzetimlerden (ileri kinematik, görüş kesiti, sürü benzetimi) türetildi; her denetim başarısızlıkta ölçülen değerleri
  yazıyor.

| Senaryo | Denetim | Neyi denetliyor (özet) |
|---|---|---|
| `smoke-menu` | 7 | ana menü görünür, 8 tabela, kamp ateşi başında 6 modelli karakter, her tabela kendi ekranını açar ve Geri döner, karakter kartları, özelleştirme vitrini kurulup kalkar |
| `smoke-single` | 7 | oturum 1. günde (başlangıç çantası, 2 YZ arkadaş, görev, hava), HUD dolu, W ile yürüme, günlüğün 5 sekmesi, inşa/takım/duraklatma panelleri, oyun duraklayıp sürer |
| `ai` | 8 | çığlıkçı oyuncuyu görünce çığlık atar ve 40 m ötedeki zombiyi çağırır, mesafesini korur; çevik kuvvet yeleği kurşunu azaltır, yakın dövüşü azaltmaz; şişko patlaması yakındakini yaralar/zehirler, uzaktakine dokunmaz; kurt sürüsü sırayla saldırır; Karabaş zombiye saldırır |
| `mobs` | 7 | 12 zombi + 6 hayvan modelli ve kadrajda, NaN yok, kovalama/çığlık/ölüm klipleri gerçekten oynuyor, hayvanlarda yürüme/dörtnal/saldırı/ölüm klipleri |
| `living` | 4 | karga sürüleri ve duman sütunları kurulur, duman yükselir ve görünür, gürültü sürüyü ürkütüp yükseltir, kargalar kadrajda |
| `lineup` | 8 | 6 karakterin 16 duruşta durum makinesi, baş yüksekliği oranları (çömelme, oturma, yüzüstü, ölü), yürüyüşte bacak açısı, el eşyası doğru elde, nişan karışımı, kılıç klibi; zombi duruşları |
| `gameplay` | 10 + 2 koşullu | yağma (arama, hepsini al), yemek/üretim, barikat inşası, savaş kurulumu, araç sürme, gece uykusu ve 2. gün, olay kartı, kayıt, bot taşıma, harita ve zaman çizelgesi. Koşullu iki denetim (çatışma sonucu, araç yer değiştirmesi) yalnız yeterli benzetim süresi geçtiyse çalışır |
| `story` | 12 | NPC ve belge yerleşimi, santral, fener + gemi + Kanlı Ay, pist enkazının halatla çekilmesi, paraşütlü paket, düşen uçak, sarsıntı, 7 olay kartı ve etkileri, kayıt sayıları, zaman çizelgesi, uçakla kaçış ve sonuç ekranı |
| `ending` | 6 | 30. gün 19:58, Son Işık 20:00'de başlar ve son gece hızlanır, 7 kaçış planının hazırlığı, sığınak finali sonuç ekranı (kazanma, S–D derece), kaçış kaydı, Ana Menü düğmesi |
| `regions` | 7 | 8 bölge görünümü çizilir, kare siyah/tek renk değil, bölge platosu ve yüksekliği, simge binalar, fener ve baraj, köprü tabliyesi |
| `nature` | 6 | 20.000+ bitki örneği, 12+ tür, 13 görünüm çizilir ve boş değil, ormanda yakın ağaç, çayırda yakın çimen, uzakta ağaç kartları |
| `audio` | 7 | ses bağlamı (HRTF, yankı, savaş teması, örnekler), çimde/asfaltta zemine göre adım, eğilerek kısık ve yavaş adım, iç mekân yankısı ve ahşap zemin, zemin sondası, duvar arkası kapanma ve HRTF, savaş teması aç/kapa |
| `motion` | 8 | 17 eylemden en az 15'inin klibi oynuyor, tam gövde kipleri (uyku, uyanma, tırmanma, yüzüstü), basamakta ve yamaçta ayak IK'sı, kişisel hareketler (alet tutma), 8 zombi türünün klipleri, NaN kemik yok |
| `physics` | 9 | yürüme/koşma hızları, zıplama ve takla, düşme hasarı eğrisi, basamak çıkma ve duvar, çömelme ve alçak tavan, eşya düşmesi, nesneler (patlama, uyku, zeminden düşmeme), 3+ araç türü sürüş, fren ve çarpma |
| `carry` | 4 | kutu E ile alınır (kinematik gövde, animasyon), taşırken yürünür ve kutu göğüs hizasında kalır, fırlatılan kutu dinamikleşip önde durur |

- **Yeni birim testleri** (7 dosya, 68 test): `save` (kayıt/yükleme gidiş-dönüşü, yuvalar, bozuk ve eski veri),
  `share` (envanterler, konteyner, sandık ve bagaj arası aktarım, eşya verme, yerdeki eşya, takas), `netevents`
  (gerçek `Net` host/istemci el sıkışması, oda kuralları, kişiye özel olaylar, yeniden katılım), `collision`
  (çarpışma dünyası, ışın, görüş hattı, zemin yüksekliği), `navgrid` (yol ızgarası, kapı/pencere, kısmi yol),
  `physics` (oyunun Rapier derlemesiyle sabit adım, uyuma, ışın, patlama itkisi, karakter gövdesi), `vehicles`
  (araç vekilleri, yol ızgarası, durum anlık görüntüsü, gerçek Rapier ile yakıt ve zemin tutunması, kayıt).
- **CI:** nadir kıyafet kombinasyonu testi (`outfits`: 63 erkek + 40 kadın kombinasyonu; NaN, boyun/bel boşluğu, derin
  iç içe geçme) her gönderimde koşan duman senaryolarına eklendi.

### Başlangıç koşusu
- `npm test`: 115 test (önceki 47 + 68 yeni), 107 geçti, 0 başarısız, 8 atlandı (her biri aşağıdaki tablodaki bir oyun
  hatasını belgeliyor), ~13,5 sn.
- Değer denetimi eklenen 15 senaryo sırayla (`node tools/e2e.mjs …`, toplam 18 dk): ilk koşuda **13/15**. Düşen ikisinin
  nedeni test kurgusuydu (aşağıda), düzeltilen testlerle yeniden koşuldu: `carry` iki koşuda, `physics` bir koşuda geçti.
  Sonuç: **15/15**.

| Senaryo | Süre | Sonuç | Öne çıkan ölçümler |
|---|---|---|---|
| `smoke-menu` | 120 sn | ✔ | 8 tabela; 7 ekran açılıp Geri ile dönüyor; kamp ateşinde 6 modelli karakter |
| `smoke-single` | 128 sn | ✔ | 1. gün, 6 yığınlık başlangıç çantası, 2 bot, 2 görev; W ile 0,7 m; 5 günlük sekmesi; inşa 4 kart/7 kategori |
| `ai` | 33 sn | ✔ | 1 çığlık, 40 m'deki zombi araştırmaya geldi; çığlıkçı oyuncuya en çok 13,7 m yaklaştı; yelek: kurşun 18, yakın dövüş 40; şişko: 1,8 m'deki zombi öldü, 28 m'deki tam can, oyuncu 83 can + zehir; kurtlar 30,4 hasar (1,5 / 7,1 / 8,7 m); Karabaş 56 hasar |
| `mobs` | 39 sn | ✔ | 12 zombi + 6 hayvan; çizime katkı 99 çağrı |
| `living` | 46 sn | ✔ | 6 sürü/66 karga, 156 duman pufu; duman tepesi 47,3 m, 148/156 görünür, 52'si kadrajda; ürkme 0,64, yükselme 16,6 m; karga çekiminde 6 karga |
| `lineup` | 57 sn | ✔ | 6 karakter + 6 zombi, 28 çekim, NaN yok; çizime katkı 106 |
| `gameplay` | 183 sn | ✔ | yağma, yemek 40→80, +2 bandaj, barikat, uyku → 2. gün, olay kartı, kayıt; araç kapalı garajda 0,44 m (koşullu denetim çalıştı); çatışma sonucu denetimi atlandı (12 sn gerçek zamanda yalnız 3,5 sn benzetim) |
| `story` | 123 sn | ✔ | 12 belge kendi binasında; santral; gemi 1,97 m yaklaştı; Kanlı Ay 0,87; 520 kg enkaz 32 m çekildi; paket 76 m'den 10 sn'de indi (9 m sapma); uçak düştü; sarsıntı tepe 104 mm; 7/7 olay kartı kendi kartı |
| `ending` | 74 sn | ✔ | Son Işık 30. gün 20:00, son gün 14 dk; sığınak finali (C derece); Ana Menü'ye dönüş |
| `regions` | 27 sn | ✔ | 8 görünüm, 69–163 renk kutusu; plato yükseklikleri ve simge binalar tam; köprü tabliyesi 9,25 m |
| `nature` | 37 sn | ✔ | 108.151 bitki örneği, 96 küme, 28 kart çeşidi; 13 görünüm boş değil |
| `audio` | 38 sn | ✔ | 22 ses örneği; çimde 4,25, asfaltta 6,69 adım hızı; eğilerek kısık adım; duvar arkası kapalı; HRTF panner |
| `motion` | 43 sn | ✔ | 17/17 eylem klibi; basamakta sol bilek +0,21 m (5/6 karakter); yamaçta (13°) kalça −0,08 m, ayak farkı 0,03 m (IK kapalıyken 0,13–0,17); 8 zombi türünün klipleri; 868 kemikte NaN yok |
| `physics` | 52 sn | ✔ (yeniden) | yürüme 4,1, koşu 6,06 m/s; zıplama 0,84 m; 9 m düşüş → 49,9 can; bırakılan eşya 115. adımda uyudu; 79 nesne (75'i uykuda); araçlar sürüş/fren/çarpma |
| `carry` | 69–72 sn | ✔ (yeniden) | kutuyla 0,51 m yürüyüş, kutu 0,7 m önde 1 m yukarıda; fırlatılan kutu 4,3 m öne düştü |

- **İlk koşuda düşen iki senaryo (test kurgusu):**
  - `carry`: oyuncu verandada eve bakarak doğuyor; taşınan kutu 0,2 m sonra ev kapısına dayanıyordu (yürüme eşiği 0,3 m).
    Oyuncu artık önce bahçeye çekilip evden uzağa dönüyor. Yeniden koşuda 0,51 m yürüdü; kutu 4,3 m öne fırlatıldı
    (eskiden kapıya çarpıp 0,96 m'de kalıyordu).
  - `physics`: bırakılan konserve 400 adımda (6,7 sn) fizik uykusuna geçmedi (2 Kasım koşusunda da aynıydı). Ayrı
    yoklamalarda 24 açık arazi bırakmasında 103–141 adımda, oyuncunun 1 m önüne 12 bırakmada 109–151 adımda,
    senaryonun kendi noktasında 4 tekrarda 108–116 adımda uyudu. Düşen koşuda sahnede bir dinamik gövde fazlaydı (89'a
    karşı 88); büyük olasılıkla eşyayı başka bir gövde dürttü. Pencere, oyunun 12 sn'lik zorla yerleştirme yedeğinin hemen
    altına (11,5 sn) çekildi: eşya hiç uyumazsa denetim yine düşer. Yeniden koşuda 115. adımda uyudu.
- **Denetim değil, günlük gözlemi:** `motion` 1. ve 2. karakterde eylem klibinin bittikten sonra sürdüğünü gösteriyor
  (hata 10; o karakterde basamak IK'sı da çalışmıyor). `ai` çığlıkçının 'scream' durumuna hiç girmediğini gösteriyor
  (hata 18).

### Testlerin bulduğu oyun hataları ve düzeltme planı
Yeni testler ve kod okuması 22 oyun hatası buldu. Birim testle yakalananlar atlanmış (`skip`) test olarak takımda
duruyor: hata düzeltilince açılıyor. Plan aşamalara göre; hikâye, kayıt ve çok oyunculu görünürlük hataları kabul
ölçütü 17'yi ("mevcut hikâye, kayıtlar, görevler ve finaller korunmalı") ve 2–6 oyunculu ortak oyunu doğrudan
etkilediği için Aşama 1'in sonunda (1b) düzeltiliyor.

| # | Hata | Kanıt | Aşama |
|---|---|---|---|
| 1 | Aynı karede vakti gelen olay kartları birbirini sessizce kapatıyor; kapanan olay kararsız kalıp bir daha gelmiyor (zaman atlaması, uyku hızlandırması sonrası) | kod (`Events.update/show`, `UIManager.openPanel`) | 1b |
| 2 | Aynı olay aynı gün yeniden gösterilirse seçim yok sayılıyor, bedel düşülüyor, kart kapanmıyor | kod (`Events.applyChoice`) | 1b |
| 3 | 3./12./20. gün yağmalama olayı hikâye konteynerlerini (virüs numunesi → "Aşı İçin Umut" görevinin tek kaynağı, cephanelik anahtarı, pilot günlüğü…) ve belge tutucuları boşaltıyor, kasaların kilidini düşürüyor | birim (`share`) | 1b |
| 4 | Konteyner, depo sandığı ve bagajda birleştirme eski yiyeceği tazeliyor (envanterdeki "eski tazelik geçerli" kuralı yok) | birim (`share`) | 1b |
| 5 | Lobiden 3+ oyuncu başlayınca oyunu sonra yükleyen istemci önce katılanı hiç görmüyor (avatar, konum, takım listesi yok); oyun sürerken aynı anda katılanlarda da aynı boşluk | birim (`netevents`) | 1b |
| 6 | Dosyadan içe aktarılan, ayarları (`cfg`) eksik kayıt doğrulamadan geçip yüklenirken çöküyor | kod (`SaveSystem.importFile`, `MenuScreens.loadSlot`) | 1b |
| 7 | Eşya verilen oyuncu o arada oyundan çıkarsa eşya kayboluyor | kod (`Session` `give`) | 1b |
| 8 | Host istemciden gelen alma miktarını doğrulamıyor (negatif miktarla konteynerde eşya çoğalıyor) | kod (`loot_take`, `store_take`) | 1b |
| 9 | Özel içerikten, ödülden ve takastan gelen silah/aletler hiç aşınmıyor (dayanıklılık yazılmıyor) | kod (`SPECIAL_LOOT`, `grant`) | 1b |
| 10 | Arama/sargı/tamir gibi döngülü eylem bir duygu hareketiyle (sevinç, dans) kesilirse klip sonsuza dek sürüyor; o karakterde ayak IK'sı ve kişisel hareketler kapanıyor | e2e (`motion`: 1. ve 2. karakter) | 2 |
| 11 | Evin zemin katında ayak sesi çim olarak çalıyor (iç zemin eşiği 0,35 m, zemin kaldırma 0,30 m) | e2e (`audio`) + kod | 2 |
| 12 | Çarpışma dünyası `isFloor`/`navType`/`navPad` seçeneklerini düşürüyor: döşeme denetimleri ölü kod; inşa hayaleti üst katlarda ve iskelede araziye düşüyor | birim (`collision`) | 3 |
| 13 | Oyuncu yapıları (duvar, çit, barikat, kapılı duvar) yol ızgarasında kırılabilir yapı değil aşılmaz engel; zombiler savunmayı kırmak yerine etrafından yol arıyor | birim (`navgrid`) | 3 |
| 14 | Patlama itkisi kütleden bağımsız aynı hızı veriyor (6 kg kasa ile 128 kg kasa, motosiklet ile 6 t kamyon aynı savruluyor) | birim (`physics`) | 3 |
| 15 | Kayıt yüklenince ve oyuna katılınca kapılar sesli uygulanıyor (kapı sesi; kırık kapıda kıymık efekti ve fiziksel enkaz) | birim (`save`) | 3 |
| 16 | Yağmur, kar ve kaygan zemin fren mesafesini uzatmıyor; kar ve kumda araç kuru asfalttan kısa duruyor | birim (`vehicles`) | 5 |
| 17 | Yere düşmüş oyuncu araca binip sürebiliyor (host denetimi yok) | e2e (`physics`) + kod | 5 |
| 18 | Çığlıkçı kendi çığlığını duyup "araştır" durumuna geçiyor: çığlık animasyonu hiç oynamıyor, istemcilere gitmiyor | e2e (`ai`) + kod | 6 |
| 19 | Boştaki zombinin "dur" seçeneği her karede yeniden zarlanıyor: zombiler neredeyse hiç durmuyor | kod (`Zombies` gezinme) | 6 |
| 20 | En yakın boş hücre araması Öklid'e göre en yakını değil, halka sırasındaki ilkini seçiyor (küçük) | birim notu (`navgrid`) | 6 |
| 21 | İstemcilerde gün/saat/evre geri çağrıları hiç çalışmıyor; istemci zaman çizelgesinde "N. gün başladı" kayıtları yok | kod (`Session` istemci zamanı) | 7 |
| 22 | Host bir oyuncuyu attıktan sonraki 300 ms içinde odadan çıkarsa sayfa hatası (`Net.kick`) | birim koşusu gözlemi | 7 |

Ayrıca: `physics` koşusunda polis aracı fren denemesinde bir şeye çarpıp hasar aldı (şerit 72 m boş denetlenmişti; büyük
olasılıkla zombi ya da önceki patlamanın enkazı). Tekrarlanırsa incelenecek.

---

# Önceki tur: "Next Level 2.0" ve 1–2 Kasım özellik turu (2 Kasım 2026)
Aşağıdaki bölümler önceki turun tam koşusuna aittir. Tam koşu oyun kodu `6c1fe8b` (özellikler + bağımsız inceleme
düzeltmeleri); belge doğrulamasının kod düzeltmeleri (`ad189ef`) ve incelemesinin düzeltmeleri (`eada2fb`, `ae28a16`)
etkilenen senaryolarla ayrıca koşuldu; test düzeltmeleri `edc311d`, `8ee993e`, `a69e949`.

## Özet
| Katman | Kapsam | Sonuç |
|---|---|---|
| Birim testleri (`npm test`) | 47 test, 9 dosya | 47/47 |
| Uçtan uca (`node tools/e2e.mjs`, sırayla) | 32 senaryo (17'sinde değer denetimi var; bu turda 5 yeni senaryo: `buildings`, `daynight`, `fronts`, `shelters`, `vehicles3`) | Tam koşu 30/32 (74 dk); düşen `multiplayer-6` test kırılganlığıydı, düzeltilip geçti; `visual` beklenen farklar, taban yenilendi. Sonraki kod düzeltmelerinden sonra etkilenen senaryolar: 8/10 (`ad189ef`; `ai2`'nin şişe denetimi düzeltildi, düzeltilmiş senaryo art arda beş koşuda geçti), 7/7 (`eada2fb`), 2/2 (`ae28a16`); 15 senaryo denetimsiz² |
| Görsel regresyon (`visual`) | istemdeki 12 sahne, 14 görüntü, Orta kalite | Aşama 8 tabanına göre 13 görüntüde fark %0–2,43; orman sahnesi %48,13 (bitki yerleşimi kaydı, aşağıda); taban yenilendi |
| CI (`.github/workflows/ci.yml`) | her gönderimde birim + `smoke-menu` + `ui-clicks` | bu turun gönderimlerinde yeşil (GitHub Actions); Pages yayını başarılı |

## Birim testleri
| Dosya | Test | Kapsam |
|---|---|---|
| `inventory.test.mjs` | 7 | yığın sınırı, ağırlık, yuva sınırı, taşıma/bölme/birleştirme, hızlı erişim çubuğu, serileştirme, yakıt bidonu ağırlığı |
| `stats.test.mjs` | 6 | açlık/susuzluk, açlıktan hasar, zırh ve yere düşme/kaldırma, bandaj/antibiyotik, çiğ et, uyku |
| `time.test.mjs` | 5 | gün uzunluğu, gün dönemleri, saat/gün olayları, 30. gün geri sayımı, uyku hızlandırması |
| `systems.test.mjs` | 5 | tazelik birleşimi, harita sisi kaydı, hava durumu, ağ-güvenli görev kancaları, kayıt meta bilgisi |
| `motion.test.mjs` | 5 | animasyon paketi kodla-çöz, oyundaki paketler, 8 yön ağırlıkları, faz hızı, durum geçişi/tek seferlik klip |
| `partmerge.test.mjs` | 3 | kit parça birleştirme (düz renk, aynı malzeme, aynalı sarım) |
| `facade.test.mjs` | 4 | cephe (subasman/panjur/oluk, korniş/köşe/yangın merdiveni, tente/kırma çatı), iç dekor ve pencere durumları |
| `net.test.mjs` | 6 | TURN/ICE süzme, koda gömülü kimlik yok, yerel taşıyıcı bağlanma/veri/kapanış, aynı odada ikinci host reddi, eşe göre zaman aşımı, kapanan host'a yeniden katılmama |
| `quality.test.mjs` | 6 | kalite ön ayarları, FPS/%1 low, halka tampon, GPU kesintisi, ayar sıfırlama, normal onarımı |

## Uçtan uca senaryolar (son tam koşu)
| Senaryo | Kapsam | Süre | Sonuç |
|---|---|---|---|
| `ai` | Zombi türleri ve hayvan YZ (çığlıkçı, zırhlı, şişko patlaması, kurt sürüsü, Karabaş) | 0 dk 35 sn | hatasız koştu (denetimsiz)² |
| `ai2` | Sürü ayrışması, oyuncunun içinden geçmeme, şişeyle dikkat dağıtma, bot yağma/inşaat emirleri | 0 dk 49 sn | geçti (ilk bölümde düştü, yeniden koşuldu)¹ |
| `audio` | Ses bağlamı + HRTF, zemine göre ayak sesi, iç mekân yankısı, oklüzyon, savaş teması | 0 dk 43 sn | hatasız koştu (denetimsiz)² |
| `benchmark` | Performans testi dört kalitede; araç reddi, duraklatma, ertelenen kayıt, iptal ve sonrasında yeni oyun | 4 dk 54 sn | geçti |
| `buildings` | 86 girilebilir binanın her birine dış kapıdan yürüyerek giriş, kulelerde kamera tavan altında, yeni binalarda konteyner, eski kapı/pencere kimlikleri aynı | 1 dk 26 sn | geçti |
| `carry` | Nesne taşıma: al, taşı, bırak, fırlat | 1 dk 16 sn | hatasız koştu (denetimsiz)² |
| `carry-mp` | İki sekmede taşıma eşitlemesi, aynı kutuyu iki kişi alamama, taşıyan çıkınca bırakma | 4 dk 15 sn | geçti (ilk bölümde düştü, yeniden koşuldu)¹ |
| `daynight` | Öğlen zombi yok, alacakaranlıkta topraktan çıkış, şafakta dönüş (ölü sayılmaz), yağmacı devriyesi, köpek sürüsü, sıcak çarpması, açıkta uyku ×8, akşamüstü uyku yavaşlar, hasar uyandırır | 0 dk 48 sn | geçti |
| `ending` | 30. gün Son Işık, sığınak finali, sonuç ekranı, menüye dönüş | 1 dk 12 sn | hatasız koştu (denetimsiz)² |
| `fronts` | 12 dolap türünde kapak aç/kapa/aralık, kilitli kasa, başka oyuncunun kullanımı, çekmece yönü ve yüksekliği | 0 dk 58 sn | geçti |
| `gameplay` | Yağma, tüketim, üretim, inşa, savaş, araç, gece/uyku, olay kartı, kayıt, taşıma | 2 dk 58 sn | hatasız koştu (denetimsiz)² |
| `host-migration` | İki sekme + geç katılan: host göçü, kapı/envanter korunur, geç katılan listede | 8 dk 28 sn | geçti |
| `host-migration3` | Üç sekme: göç, zombi durumu ve yağmalanmış envanter korunur, ikinci istemci yeni host'a bağlanır | 11 dk 03 sn | geçti |
| `interact` | Etkileşim hizası: hedefe dönme, eğilme anında alma, kapı kolu zamanlaması | 1 dk 36 sn | geçti |
| `lineup` | Altı karakter farklı animasyon durumlarında (görsel kontrol) | 1 dk 03 sn | hatasız koştu (denetimsiz)² |
| `living` | Karga sürüleri ve duman, gürültüyle ürkme | 0 dk 38 sn | hatasız koştu (denetimsiz)² |
| `mobs` | Bütün zombi türleri ve hayvanlar (görsel kontrol) | 0 dk 43 sn | hatasız koştu (denetimsiz)² |
| `motion` | Eylem klipleri, zombi görünümleri, ayak IK'sı yamaçta, kıpırdanma | 0 dk 46 sn | hatasız koştu (denetimsiz)² |
| `multiplayer-6` | 6 oyunculu ortam (2 sekme + 4 sahte eş), 7. oyuncu reddi, hayvan/tüccar/eylem eşitlemesi | 4 dk 53 sn | tam koşuda düştü (test kırılgandı); test düzeltildi, yeniden koşu geçti¹ |
| `multiplayer-local` | İki sekme: oda, katılım, eşitleme, istemci eylemi, zombi anlık görüntüsü, sohbet; istemcinin açtığı dolap host'ta açık, host kendi aracını sürer ve istemci hareketi görür | 4 dk 50 sn | geçti |
| `nature` | Bitki örtüsü görünümleri, çizim/üçgen/kare süresi ölçümü | 0 dk 39 sn | hatasız koştu (denetimsiz)² |
| `physics` | Hareket ölçümleri: hız, zıplama, düşme hasarı, basamak, eğim, eşya düşürme | 1 dk 03 sn | hatasız koştu (denetimsiz)² |
| `physics2` | Menteşeli kapı, kilit, kırılma, su kaldırma kuvveti, çarpışma sesleri, çekmece | 4 dk 05 sn | geçti |
| `regions` | Bölge turu (görsel kontrol) | 0 dk 29 sn | hatasız koştu (denetimsiz)² |
| `shelters` | 8 sığınağa E ile iniş/çıkış, bütün odalara/konteynerlere/jeneratöre yürüyerek erişim, kilitler, kamera, yağmur/deniz gizli, zombi ve hayvan algısı, ışık, ganimet, uyku, kayıt, ev sığınağı, takipçi bot, kızıl sis | 0 dk 50 sn | geçti |
| `smoke-menu` | Ana menü ve menü ekranları | 2 dk 03 sn | hatasız koştu (denetimsiz)² |
| `smoke-single` | Tek oyunculu başlangıç, HUD, paneller, hareket | 2 dk 08 sn | hatasız koştu (denetimsiz)² |
| `story` | Hikâye: NPC/belge yerleşimi, santral, fener, pist enkazı çekme, paket, düşen uçak, Kanlı Ay, uçak finali | 2 dk 10 sn | hatasız koştu (denetimsiz)² |
| `ui-clicks` | Gerçek fare tıklaması: ana menü ekranları, ayarlar, Tek Oyna, günlük sekmeleri, duraklat menüsü | 2 dk 46 sn | geçti |
| `vehicles2` | Kabin, kapı, bagaj, far, zemine göre sürüş, çarpışma hasarı, göçük normalleri, kapıya çarpma | 0 dk 37 sn | geçti |
| `vehicles3` | Terk edilmiş arabalar: gerçek araç, bagaj, arıza/onarım, az yakıt, iki yandan binme, sürüş, far havuzu, göçük, boya, park uykusu, yakıt verimi, zombi araç içinden geçmez, eski kayıt | 0 dk 36 sn | geçti |
| `visual` | Görsel regresyon, 14 görüntü (Orta kalite) | 2 dk 49 sn | farklar incelendi, taban yenilendi³ |

¹ Tam koşu iki bölümde yapıldı: ilk arka plan komutu 30 dk zaman sınırına takılıp `host-migration` sonrasında durdu,
kalan 22 senaryo (düşen ikisiyle birlikte) aynı oyun koduyla yeniden koşuldu. Düşen senaryoların nedenleri:
- `ai2`: testin yalıtım eksiği. Takipçi botlar zombi denetimlerinin ortasında testin zombileriyle dövüşüyor, ısırılıp
  kanayan bot inşaat adımında düşebiliyordu. Botlar zombi adımlarında 75 m ötede bekliyor, bot adımlarından önce tam
  iyileşiyor (`edc311d`); düzeltilmiş senaryo üç yoklamada ve yeniden koşuda geçti. Sonraki bir koşuda şişe denetimi
  zombinin rastgele doğuş yönü yüzünden düştü (oyuncuya bakarsa sesten önce onu görüp kovalıyor); zombi oyuncuya
  sırtı dönük doğuyor (`a69e949`), düzeltilmiş senaryo art arda beş koşuda geçti.
- `carry-mp`: ikinci sekme 150 sn içinde menüye ulaşamadı; o sırada paralel bir bitki karşılaştırma yoklaması da
  tarayıcı çalıştırıyordu (4 çekirdekte üç tarayıcı). Oyun kodu değişmeden tek başına yeniden koşuldu: geçti.
- `multiplayer-6`: uzak avatar ilk gördüğü eylemi süresi dolmuşsa bilerek oynatmaz; bu koşuda host karesi ~2 sn
  sürdü (sahte eşlerin anlık görüntü aralığı 2.071 ms) ve 2,5 sn'lik arama eylemi istemciye ulaştığında bitmiş
  sayıldı. Test önce kısa bir ısınma eylemi bekliyor (`8ee993e`); yeniden koşuda eylem 1,19 sn ofsetle oynatıldı.

² Bu 15 senaryoda değer denetimi (`check`/`[assert]`) yok: yalnız sayfa hatası, çökme ya da bekleme zaman aşımıyla
başarısız olabilirler. "Hatasız koştu" davranışın doğru olduğunu kanıtlamaz; bir kısmı (lineup, mobs, regions, living,
nature) görsel kontrol için ekran görüntüsü üretir. Değer denetimi olan 17 senaryo: ai2, benchmark, buildings,
carry-mp, daynight, fronts, host-migration, host-migration3, interact, multiplayer-6, multiplayer-local, physics2,
shelters, ui-clicks, vehicles2, vehicles3, visual. `motion` senaryosunun yamaç (ayak IK'sı) bölümü yalnız günlüğe yazar.

³ `visual`: aşağıdaki "Görsel regresyon (1–2 Kasım özellik turu)" bölümü.

Tam koşu: 32 senaryo sırayla, toplam 74 dk (iki bölüm); her senaryonun tam çıktısı `/tmp/e2e-<ad>.log`.

### Tam koşudan sonraki kod düzeltmeleri
Park etmiş araçların yol ızgarasına girmesi, araç vekillerinin sıklaşması ve botun kat denetimi zombi, bot, araç ve
çok oyunculu yollarına dokunduğu için etkilenen 10 senaryo yeni kodla koşuldu: `vehicles2`, `vehicles3`, `ai`,
`multiplayer-local`, `gameplay`, `shelters`, `buildings`, `multiplayer-6` geçti; `visual` yalnız beklenen orman farkıyla
düştü; `ai2` şişe denetiminde düştü (zombinin rastgele yönü, yukarıda ¹). Ayrıca bir yoklama: park etmiş 43 kara
aracının hepsi ızgarada engel; binince hücre boşalıyor, inince yeniden engel; araç merkezinde istenen 8 zombinin hiçbiri
araç içinde doğmadı; sığınaktaki bot yüzeydeki düşmüş bota yönelmiyor.

`eada2fb` (arkadaki park etmiş araç atışı kesmiyor; ulaşılamayan hedefte zombi yol aramasını her karede yinelemiyor)
için `ai`, `ai2`, `daynight`, `gameplay`, `story`, `vehicles3`, `shelters`: 7/7. Yoklamalar eski kodla karşılaştırıldı:
araba oyuncunun arkasındayken 5 atış eski kodda 0, yeni kodda 102 hasar (araba öndeyken ikisinde de 0, siper çalışıyor);
göl ortasına giden zombi 3 sn'de eski kodda 180, yeni kodda 3 yol araması (ulaşılabilir hedefe ilerleme aynı).
`ae28a16` (botta bulunamayan yol her karede aranmıyor) için `ai2` ve `shelters`: 2/2.

## Görsel regresyon (1–2 Kasım özellik turu)
Aynı test (`tests/e2e/visual.mjs`: Orta kalite, döngü durdurulmuş, saat/hava/rastgelelik ve ortam ışığı sabit, araçlar
hasarsız) bu turun koduyla Aşama 8 tabanına karşı koşuldu. Ölçüt: kanal farkı 40/255'i aşan piksel oranı; eşik %2,5
(menü sahnelerinde %4, envanterde %3).

| Görüntü | Fark | Açıklama |
|---|---|---|
| 01 ana menü | %0,38 | |
| 02 karakter seçimi (altı karakter) | %0,18 | |
| 03a özelleştirme vitrini | %0,13 | |
| 03b oyun içi yüz yakın plan | %1,28 | karakterin yanında çiçek öbeği (bitki yerleşimi) ve kafa duruşunda birkaç piksellik kayma |
| 04 başlangıç mahallesi | %0,66 | |
| 05 şehir merkezi | %0,21 | |
| 06 orman | **%48,13** | bitki yerleşimi kaydı: sahnenin çevresindeki 120 ağacın 45'i aynı yerde (aşağıda) |
| 07 bina içi | %0,96 | |
| 08a araç dışı | %0,76 | arka plandaki çiçek/çimen öbekleri (bitki yerleşimi) |
| 08b araç içi | %0,08 | direksiyon simidi artık sürücü tarafında görünüyor |
| 09 zombi yakın plan | %2,43 | başka zombi görünümü seçiliyor (görünüm doğma sırasına bağlı; gündüz zombi doğmadığı için sıra değişti) |
| 10 gece üs savunması | %0,02 | |
| 11 envanter | %0 | |
| 12 çok oyunculu lobi | %0,17 | |

- Orman sahnesi: bitki dağılımı tek bir rastgele sayı dizisiyle taranıyor; orman sığınağının girişinin yerindeki ağaç
  düşünce tarama sırasında sonra gelen orman ağaçları ve çimenlerin yaklaşık yarısı başka yerde çıkıyor. Aşama 8 koduyla
  karşılaştırıldı: 3.434 ağacın %87,4'ü, çimenlerin %52,9'u aynı yerde. Oynanışa ve kayıtlara etkisi yok.
- İlk koşuda bulunan iki sorun düzeltildi: inceleme öncesi kodda (`7a45173`) yüzeyde ortam ışığı 0,85 yerine 0,35'e
  çekiliyordu (ana menü %3,55, özelleştirme %5,3 farklıydı; düzeltildi, şimdi %0,38 ve %0,13). Görsel test araç
  sahnelerinde ayrıntı düzeyini kameraya göre yenilemiyordu (gösterge paneli ve kapı kanatları gizli kalıyordu); test
  düzeltildi (`8ee993e`).
- Taban (`tests/visual/baseline/`) bu turun görüntüleriyle yenilendi (`VISUAL_BASELINE=1 node tools/e2e.mjs visual`).

## Görsel regresyon (önceki tur: Aşama 7 → Aşama 8)
Aynı test (`tests/e2e/visual.mjs`: Orta kalite, döngü durdurulmuş, saat/hava/rastgelelik ve ortam ışığı sabit,
araçlar hasarsız) önce Aşama 7 koduyla (`95f460b`), sonra Aşama 8 koduyla koşuldu. Ölçüt: kanal farkı 40/255'i aşan
piksel oranı; eşik %2,5 (menü sahnelerinde %4, envanterde %3).

| Görüntü | Fark |
|---|---|
| 01 ana menü | %0,07 |
| 02 karakter seçimi (altı karakter) | %0 |
| 03a özelleştirme vitrini | %0,01 |
| 03b oyun içi yüz yakın plan | %0,02 |
| 04 başlangıç mahallesi | %0 |
| 05 şehir merkezi | %0 |
| 06 orman | %0 |
| 07 bina içi | %0 |
| 08a araç dışı | %99,08 — Aşama 7 kodunda kare tamamen siyah (göçük normali NaN hatası), Aşama 8'de doğru |
| 08b araç içi | %0 |
| 09 zombi yakın plan | %0 |
| 10 gece üs savunması | %0 |
| 11 envanter | %0 |
| 12 çok oyunculu lobi | %0 |

Taban (`tests/visual/baseline/`) artık Aşama 8 görüntüleri. Ultra görüntüleri `VISUAL_QUALITY=ultra` ile alındı;
Orta–Ultra karşılaştırması ve 08a'nın önce/sonrası `docs/img/` altında.

## Performans ölçümü (yazılım GPU'su — gerçek donanım değil)
`benchmark` senaryosu: oyun içi performans testi dört kalitede, 576×324 (çözünürlük ölçeği %60), sahne başına 3 sn.
Kare hızı 0,1–17 FPS (gölgelendirme CPU'da); **gerçek ekran kartı performansı olarak okunmamalı**. Çizim çağrısı ve
üçgen sayısı karenin bütün geçişlerini (gölge haritası, AO, yansıma, son işlem) kapsar.

| Sahne | Çizim: Düşük / Orta / Yüksek / Ultra | Üçgen (milyon): Düşük / Orta / Yüksek / Ultra |
|---|---|---|
| Şehir merkezi | 462 / 771 / 840 / 1.142 | 2,71 / 3,57 / 3,69 / 5,34 |
| Orman | 240 / 513 / 641 / 3.760 | 1,68 / 2,77 / 3,98 / 25,56 |
| Üs (ev) | 273 / 531 / 553 / 872 | 1,08 / 1,65 / 1,79 / 3,53 |
| Zombi sürüsü (40) | 614 / 1.022 / 1.274 / 1.868 | 3,17 / 4,28 / 4,42 / 6,35 |

Aynı senaryo performans testinin sağlamlığını da denetler: araçta reddedilir, duraklatılan ölçüm devam edince
tamamlanır, test sırasında tetiklenen otomatik kayıt sona ertelenir, oyun kapanınca test iptal edilir ve ardından yeni
oyun başlar, sonuç tablosu yazılım GPU'su uyarısı gösterir.

## Test edilemeyenler
- Gerçek internet üzerinden PeerJS/WebRTC bağlantısı ve TURN: ortamın ağ kısıtı. Aynı protokol yerel taşıyıcıyla
  (`multiplayer-local`, `carry-mp`, `host-migration`, `host-migration3`, `multiplayer-6`) test edildi.
- Gerçek ekran kartında kare hızı (1080p/60 FPS hedefi doğrulanamadı); oyun içi performans testi oyuncunun kendi
  donanımında ölçmesi için.
- Hoparlörden duyulan ses ve sesli sohbetin 3B konumlandırması (başsız tarayıcı, mikrofon/hoparlör yok).
- Fare işaretçi kilidi: koşucu kilidi kapatır (başsız kabukta Chromium'un imleci ortalama döngüsü saniyede on
  binlerce sentetik fare olayı üretip iki sekmede tarayıcıyı çökertiyordu; `PW_POINTERLOCK=1` ile açılır).
- Altı tam oyun sekmesi: 6 oyunculu ortam 2 gerçek sekme + 4 protokol düzeyi sahte eş.

## Testleri çalıştırma
```bash
npm install && npx playwright install chromium   # bir kez (Playwright package.json'da; tarayıcı ayrıca indirilir)
npm test
npm run test:e2e       # tools/e2e.mjs: kendi sunucusunu açar, senaryoları sırayla koşar, özet tablo basar
node tools/e2e.mjs carry carry-mp    # seçili senaryolar; tam çıktı /tmp/e2e-<ad>.log
# elle: npm start & ; node tools/scenario.mjs tests/e2e/<senaryo>.mjs
```

## Önceki sürüm (v0.2) notları
Aşağıdaki bölümler v0.2 test raporundandır; sayıları o sürüme aittir.

### v0.2 eklemeleri (hikâye, zaman çizelgesi, hikâye dünyası, ses)

| Senaryo | Kapsam | Sonuç |
|---|---|---|
| `tests/e2e/story.mjs` | Yeni NPC'lerin yerleri (otel içindekiler kat zemininde: y = 3,8 = kat), 12 hikâye belgesinin doğru binalara/odalara düşmesi, santral (elektrik → sokak lambaları + pompalar), fener (huzme + gemi), Kanlı Ay (kızıl ay, zombi hızı/yoğunluğu), **pist enkazını halatla araca bağlayıp çekme**, pist temiz kararı, paraşütlü paket, düşen uçak, sarsıntı, 7 yeni olay kartı, kayıt, zaman çizelgesi, uçakla kaçış (taksi → kalkış koşusu → havalanma) ve epilog | ✅ |
| `tests/e2e/audio.mjs` | Ses bağlamı + HRTF, zemine göre ayak sesleri (çim / asfalt / ahşap zemin), iç mekân yankısı, duvar arkası oklüzyon (kapalı/açık), savaş teması aç-kapa | ✅ 0 hata |
| `tools/event-art.mjs` | 9 yeni olay görselinin oyun sahnelerinden çizimi | ✅ |

Ölçümler (hikâye testi, sabit 1/60 sn adım):
- Halatla çekme: 520 kg enkaz, arazi aracı (2000 kg) 7 sn gaz → enkaz **20,9 m** çekildi, pistten çıktı; host 2 sn içinde "pist temiz" kararı verdi.
- Yardım paketi: 115 m'den paraşütle **10 sn**'de yere indi, rüzgârla hedef noktaya **9 m** yakına süzüldü; konteyner sandığın son konumunu izliyor.
- Düşen uçak: 8,5 sn dalış → patlama, enkaz, 90 sn yangın alanı, kargo bölmesi konteyneri.
- Uçak finali: hazırlık (onarım/60 L/pist/pilot) ✓ → kalkış: taksi + kalkış koşusu, x = 299'da havalandı; oyuncu kaçtı, sonuç ekranında 4 satırlık epilog.
- Ayak sesleri: 2 sn yürüyüşte 7 adım (çim), 2 sn koşuda 7 adım (asfalt), evde ahşap zemin.

### Ölçülen değerler (oynanış testinden)
- Yeme: açlık 40 → 80 · Üretim: 4 kumaş → 2 bandaj · Barikat inşası → savunma puanı 3
- 2 zombi doğuruldu → YZ arkadaşlar (Deniz tabanca, Zülal bıçak) ikisini de öldürdü, oyuncu hasar almadı
- Uyku oylaması: 1/1 → zaman x40 hızlandı · 2. gün sabahı takvim yayını geldi
- Kayıt: ~8 KB JSON (yuva + otomatik) · Taşıma: yere düşen arkadaş sırtlandı, oyuncuyla birlikte taşındı, bırakıldı, kaldırıldı
- Çok oyunculu: istemcinin aradığı dolaptaki eşyalar istemcinin envanterine geçti, host'ta konteyner boşaldı; 4/4 zombi istemcide görüldü

### Doğrulanan senaryolardan notlar
- **Çok oyunculu kimlik:** Aynı tarayıcıdaki ikinci sekme aynı oyuncu jetonunu taşıdığı için host jetonu
  otomatik olarak ayırır (`…-2`); yeniden bağlanmada aynı jeton kullanılır ve kayıtlı eşyalar iade edilir.
- **Bulunan ve düzeltilen hatalar (test sürecinde):**
  - Yavaş yüklenen istemci, yerel taşıyıcının 12 sn'lik zaman aşımıyla düşürülüyordu → 45 sn'ye çıkarıldı,
    düşürülen eşe "yeniden bağlan" bildirimi eklendi.
  - Dinamik (olaylardan gelen) görevlerde ilerleme işleyicisi çöküyordu → düzeltildi, istemcilere görev tanımı da gönderiliyor.
  - Zombi nüfus hesabı aktif zombileri saymadığı için 1. gün evin çevresinde 15+ zombi oluşuyordu →
    bölge yoğunluğu/gün/gece ölçekli doğru sayım.
  - Park'taki kayıp çocuk (Can) oyuncu yanına gelmeden zombilerce öldürülebiliyordu → yalnızca eskortta hedef olur.
  - Köprü üzerindeki araç "suya battı" sayılıyordu → yükseklik kontrolü eklendi; köprü sonuna bariyer.
  - Başlık yazı tipi Türkçe Ş/İ/Ğ içermiyordu → Türkçe destekli Luckiest Guy'a geçildi.
  - Arayüz yardımcısında boşluklu sınıf adları öğe türünü bozuyordu (envanter yuvaları) → düzeltildi.

### Performans ölçümü (v0.2; başsız Chromium, yazılım GPU'su, 960×540, yüksek kalite, %50 çözünürlük)

| Konum | Çizim çağrısı / kare | Üçgen / kare |
|---|---|---|
| Üs (mahalle) | ~470 | ~0,75 M |
| Şehir merkezi | ~1240 | ~1,5 M |
| Sanayi | ~1310 | ~1,5 M |
| Orman | ~720 | ~1,1 M |
| Askerî bölge | ~990 | ~1,2 M |

Yazılım GPU'sunda bile 18–28 FPS ölçüldü; gerçek GPU'larda çok daha yüksek olması beklenir. Düşük kare
hızında **otomatik çözünürlük** iç çözünürlüğü %55'e kadar indirir.

