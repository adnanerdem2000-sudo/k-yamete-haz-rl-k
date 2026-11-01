# Test Raporu — "Next Level 2.0" turu sonu

Tarih: 1 Kasım 2026 · Ortam: Linux (4 çekirdek), Node 22, başsız Chromium (Playwright 1.63) + SwiftShader yazılım
GPU'su · Oyun kodu `5a3c517` (sonrasında yalnız test ve belge değişti), testler `ed1b805`

Bu rapordaki bütün sayılar son koşulardan alınmıştır. Yazılım GPU'sunda ölçülen kare hızları gerçek ekran kartı
performansı **değildir**; yalnız kalite seviyelerinin yükünü (çizim çağrısı, üçgen, ek geçişler) karşılaştırmak için
kullanılır.

## Özet
| Katman | Kapsam | Sonuç |
|---|---|---|
| Birim testleri (`npm test`) | 47 test, 9 dosya | 47/47 |
| Uçtan uca (`node tools/e2e.mjs`, sırayla) | 27 senaryo | 27/27 (tam koşuda 26/27; `benchmark` test denetimi düzeltilip yeniden koşuldu) |
| Görsel regresyon (`visual`) | istemdeki 12 sahne, 14 görüntü, Orta kalite | Aşama 7 → 8 karşılaştırması: fark %0–0,07, araç dışı Aşama 7'de siyah kare (düzeltilen hata); tam koşuda Aşama 8 tabanına göre ≤ %0,06 |
| CI (`.github/workflows/ci.yml`) | her gönderimde birim + `smoke-menu` + `ui-clicks` | son koşu yeşil (GitHub Actions, run 37) |

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
| `ai` | Zombi türleri ve hayvan YZ (çığlıkçı, zırhlı, şişko patlaması, kurt sürüsü, Karabaş) | 0 dk 50 sn | geçti |
| `ai2` | Sürü ayrışması, oyuncunun içinden geçmeme, şişeyle dikkat dağıtma, bot yağma/inşaat emirleri | 1 dk 03 sn | geçti |
| `audio` | Ses bağlamı + HRTF, zemine göre ayak sesi, iç mekân yankısı, oklüzyon, savaş teması | 0 dk 49 sn | geçti |
| `benchmark` | Performans testi dört kalitede; araç reddi, duraklatma, ertelenen kayıt, iptal ve sonrasında yeni oyun | 11 dk 29 sn | geçti (yeniden koşu)¹ |
| `carry` | Nesne taşıma: al, taşı, bırak, fırlat | 1 dk 27 sn | geçti |
| `carry-mp` | İki sekmede taşıma eşitlemesi, aynı kutuyu iki kişi alamama, taşıyan çıkınca bırakma | 4 dk 56 sn | geçti |
| `ending` | 30. gün Son Işık, sığınak finali, sonuç ekranı, menüye dönüş | 1 dk 39 sn | geçti |
| `gameplay` | Yağma, tüketim, üretim, inşa, savaş, araç, gece/uyku, olay kartı, kayıt, taşıma | 3 dk 56 sn | geçti |
| `host-migration` | İki sekme + geç katılan: host göçü, kapı/envanter korunur, geç katılan listede | 10 dk 08 sn | geçti |
| `host-migration3` | Üç sekme: göç, zombi durumu ve yağmalanmış envanter korunur, ikinci istemci yeni host'a bağlanır | 14 dk 26 sn | geçti |
| `interact` | Etkileşim hizası: hedefe dönme, eğilme anında alma, kapı kolu zamanlaması | 2 dk 30 sn | geçti |
| `lineup` | Altı karakter farklı animasyon durumlarında (görsel kontrol) | 0 dk 56 sn | geçti |
| `living` | Karga sürüleri ve duman, gürültüyle ürkme | 1 dk 00 sn | geçti |
| `mobs` | Bütün zombi türleri ve hayvanlar (görsel kontrol) | 0 dk 43 sn | geçti |
| `motion` | Eylem klipleri, zombi görünümleri, ayak IK'sı yamaçta, kıpırdanma | 0 dk 55 sn | geçti |
| `multiplayer-6` | 6 oyunculu ortam (2 sekme + 4 sahte eş), 7. oyuncu reddi, hayvan/tüccar/eylem eşitlemesi | 4 dk 49 sn | geçti |
| `multiplayer-local` | İki sekme: oda, katılım, eşitleme, istemci eylemi, zombi anlık görüntüsü, sohbet | 4 dk 54 sn | geçti |
| `nature` | Bitki örtüsü görünümleri, çizim/üçgen/kare süresi ölçümü | 0 dk 49 sn | geçti |
| `physics` | Hareket ölçümleri: hız, zıplama, düşme hasarı, basamak, eğim, eşya düşürme | 1 dk 21 sn | geçti |
| `physics2` | Menteşeli kapı, kilit, kırılma, su kaldırma kuvveti, çarpışma sesleri, çekmece | 5 dk 00 sn | geçti |
| `regions` | Bölge turu (görsel kontrol) | 0 dk 32 sn | geçti |
| `smoke-menu` | Ana menü ve menü ekranları | 2 dk 09 sn | geçti |
| `smoke-single` | Tek oyunculu başlangıç, HUD, paneller, hareket | 2 dk 59 sn | geçti |
| `story` | Hikâye: NPC/belge yerleşimi, santral, fener, pist enkazı çekme, paket, düşen uçak, Kanlı Ay, uçak finali | 3 dk 01 sn | geçti |
| `ui-clicks` | Gerçek fare tıklaması: ana menü ekranları, ayarlar, Tek Oyna, günlük sekmeleri, duraklat menüsü | 3 dk 46 sn | geçti |
| `vehicles2` | Kabin, kapı, bagaj, far, zemine göre sürüş, çarpışma hasarı, göçük normalleri, kapıya çarpma | 1 dk 03 sn | geçti |
| `visual` | Görsel regresyon, 14 görüntü (Orta kalite) | 5 dk 50 sn | geçti |

¹ Tam koşuda `benchmark` yalnız yeni eklenen bir denetimde düştü: iptalden sonra açılan yeni oyunda fiziğin ilerlemesi
3 sn içinde bekleniyordu, oysa yazılım GPU'sunda yeni dünyanın ilk kareleri ~7 sn sürüyor (fizik kare döngüsünde
adımlanır). Denetim "en fazla 3 dk içinde 30 adım" oldu; yeniden koşuda yeni oyun 37 sn'de 30 fizik adımı attı
(5 kare). Oyun kodu değişmedi.

Tam koşu: 27 senaryo sırayla, toplam 92 dk (`benchmark` yeniden koşusu hariç); her senaryonun tam çıktısı
`/tmp/e2e-<ad>.log`. Başarısız senaryonun denetim hataları artık özet satırının altına basılır (CI günlüğünde neden
görünsün).

## Görsel regresyon (Aşama 7 → Aşama 8)
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

