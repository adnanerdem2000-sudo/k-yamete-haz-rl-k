# Test Raporu — v0.2 (web prototipi)

Tarih: 31 Ekim 2026 · Ortam: Linux, Node 22, başsız Chromium (Playwright, SwiftShader yazılım GPU'su)

## Özet

| Katman | Kapsam | Sonuç |
|---|---|---|
| Birim testleri (`npm test`) | 31 test: envanter (yığın, ağırlık, taşıma, bölme, sıralama, tazelik birleşimi), ihtiyaçlar (açlık/susuzluk, kanama, enfeksiyon, ısı, yere düşme/kaldırma, tüketim), zaman (30 gün, evreler, saat olayları, Son Işık geri sayımı), harita sisi RLE kaydı, hava durumu, ağ-güvenli görev kancaları, kayıt meta bilgisi + animasyon paketi kodla-çöz, klip/hız tutarlılığı, 8 yön ağırlıkları, faz hızı, durum geçişi, tek seferlik klip; kit parça birleştirme (düz renk pişirme, aynı malzeme, aynalı sarım) | ✅ 31/31 |
| Uçtan uca: menü (`tests/e2e/smoke-menu.mjs`) | Önyükleme, ana menü tabelaları, Karakterler, Özelleştirme (3B vitrin), Ayarlar, Nasıl Oynanır, Krediler, Tek Oyna, Arkadaşlarla Oyna ekranları | ✅ 0 hata |
| Uçtan uca: tek oyuncu (`smoke-single.mjs`) | Oyun başlatma (2 YZ arkadaşla), HUD, hareket, günlük sekmeleri (envanter/üretim/karakter/görevler/harita), inşa menüsü, takım paneli, duraklatma | ✅ 0 hata |
| Uçtan uca: oynanış (`gameplay.mjs`) | Konteyner arama + depo paneli + hepsini al, yeme, bandaj üretimi, inşa hayaleti + barikat inşası (savunma puanı), zombi doğurma + YZ arkadaş savaşı (öldürme sayısı), araca binip sürme, gece, uyku oylaması (zaman x40), 2. gün takvim yayını, rastgele olay kartı + seçim, kayıt (yuva + otomatik), yaralı arkadaşı sırtlama/bırakma/kaldırma, harita | ✅ 0 hata |
| Uçtan uca: çok oyunculu (`multiplayer-local.mjs`) | İki sekme (BroadcastChannel taşıyıcısı): oda kur, katıl, karakter seç, hazır, başlat; iki tarafta oyuncu listesi; konum eşitleme; istemcinin yağma eylemi host'ta işlenip eşyaların istemciye verilmesi; konteynerin host'ta boşalması; zombi anlık görüntülerinin istemciye ulaşması; sohbet; istemcinin ayrılması | ✅ 0 hata |
| Uçtan uca: final (`ending.mjs`) | 30. gün akşamı, kaçış hazırlık durumları (6 final), sığınak kaçışı → sonuç ekranı (ad, derece, istatistikler) → ana menüye dönüş ve oturumun temizlenmesi | ✅ 0 hata |

## v0.2 eklemeleri (hikâye, zaman çizelgesi, hikâye dünyası, ses)

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

## Ölçülen değerler (oynanış testinden)
- Yeme: açlık 40 → 80 · Üretim: 4 kumaş → 2 bandaj · Barikat inşası → savunma puanı 3
- 2 zombi doğuruldu → YZ arkadaşlar (Deniz tabanca, Zülal bıçak) ikisini de öldürdü, oyuncu hasar almadı
- Uyku oylaması: 1/1 → zaman x40 hızlandı · 2. gün sabahı takvim yayını geldi
- Kayıt: ~8 KB JSON (yuva + otomatik) · Taşıma: yere düşen arkadaş sırtlandı, oyuncuyla birlikte taşındı, bırakıldı, kaldırıldı
- Çok oyunculu: istemcinin aradığı dolaptaki eşyalar istemcinin envanterine geçti, host'ta konteyner boşaldı; 4/4 zombi istemcide görüldü

## Doğrulanan senaryolardan notlar
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

## Performans ölçümü (başsız Chromium, yazılım GPU'su, 960×540, yüksek kalite, %50 çözünürlük)

| Konum | Çizim çağrısı / kare | Üçgen / kare |
|---|---|---|
| Üs (mahalle) | ~470 | ~0,75 M |
| Şehir merkezi | ~1240 | ~1,5 M |
| Sanayi | ~1310 | ~1,5 M |
| Orman | ~720 | ~1,1 M |
| Askerî bölge | ~990 | ~1,2 M |

Yazılım GPU'sunda bile 18–28 FPS ölçüldü; gerçek GPU'larda çok daha yüksek olması beklenir. Düşük kare
hızında **otomatik çözünürlük** iç çözünürlüğü %55'e kadar indirir.

## Test edilemeyenler
- PeerJS (WebRTC) ile gerçek internet üzerinden bağlantı, TURN sunucusu ve sesli sohbet (3B konumlandırma
  dahil): geliştirme ortamının ağ kısıtı ve mikrofon/hoparlör yokluğu nedeniyle çalıştırılamadı. Protokol aynı
  olduğundan yerel taşıyıcı testleri (`multiplayer-local`, `carry-mp`, `host-migration`, `host-migration3`,
  `multiplayer-6`) mantığı doğrular;
  NAT/TURN kaynaklı sorunlar `KNOWN_ISSUES.md`'de.
- Altı tam oyun sekmesiyle çok oyunculu oyun: yazılım GPU'sunda çok yavaş; 6 oyunculu ortam 2 gerçek sekme + 4
  protokol düzeyi sahte eşle test edildi (`multiplayer-6`). Üç gerçek sekmeyle host göçü test edildi (`host-migration3`).
- Gerçek GPU'da kare hızı, hoparlörden duyulan ses (başsız tarayıcıda ses grafiği çalışır ama dinlenemez)
  ve fare işaretçi kilidi. Test koşucusu kilidi kapatır: başsız kabukta kilit, Chromium'un imleci ortalama
  döngüsünü tetikleyip saniyede on binlerce sentetik fare olayı üretiyor ve iki sekmede tarayıcıyı bellekten
  çökertiyordu (`tools/scenario.mjs`, `PW_POINTERLOCK=1` ile açılır). Savaş girdisi testlerde doğrudan çağrılır.

## Testleri çalıştırma
```bash
npm install && npx playwright install chromium   # bir kez (Playwright package.json'da; tarayıcı ayrıca indirilir)
npm test
npm run test:e2e       # tools/e2e.mjs: kendi sunucusunu açar, senaryoları sırayla koşar, özet tablo basar
node tools/e2e.mjs carry carry-mp    # seçili senaryolar; tam çıktı /tmp/e2e-<ad>.log
# elle: npm start & ; node tools/scenario.mjs tests/e2e/<senaryo>.mjs
```
