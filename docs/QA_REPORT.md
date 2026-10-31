# Kalite Kontrol Raporu — "Next Level" Yükseltme Turu

Bu rapor, `docs/QUALITY_AUDIT.md`'deki aşama planının bu turda uygulanan kısmını, her senaryonun nasıl
doğrulandığını, ölçülen performans değerlerini ve **hâlâ eksik olanları** listeler. Tüm testler başsız
Chromium'da (yazılım GPU'su, SwiftShader) koşar; kare süreleri bu yüzden gerçek donanımı temsil etmez, ama
çizim çağrısı / üçgen / CPU maliyeti ölçümleri donanımdan bağımsızdır.

## 1. Test altyapısı

| Test | Ne doğrular |
|---|---|
| `npm test` (31 birim testi) | envanter, istatistikler, sistemler, zaman; animasyon paketi kodla-çöz gidiş dönüşü, oyundaki paketlerin klip/hız tutarlılığı, 8 yön ağırlıkları, faz hızı (ayak kayması), durum geçişi, tek seferlik klip yaşam döngüsü; **yeni:** kit parça birleştirme (düz renk pişirme, aynı malzeme birleştirme, aynalı parça sarımı) |
| `npm run test:e2e` → `tools/e2e.mjs` | **yeni koşucu:** kendi statik sunucusunu açar, tüm senaryoları **sırayla** koşar (yazılım GPU'sunda eşzamanlı tarayıcılar bellek yetmezliğiyle sekme çökertir), özet tablo basar, tam çıktı `/tmp/e2e-<ad>.log` |
| `smoke-menu`, `smoke-single` | menü, oyun başlangıcı, HUD, paneller, yürüme |
| `gameplay` | oynanış döngüsü, harita, zaman çizelgesi |
| `multiplayer-local` | iki sekme host/istemci, katılma/ayrılma, eşitleme, istemci yağması, sohbet |
| `physics` | Rapier karakter/araç/eşya fiziği |
| `ai`, `mobs` | zombi/hayvan YZ, sürüler, türler |
| `story`, `audio`, `ending` | olaylar, 3B ses, finaller |
| `motion` | tüm eylem klipleri, uyku/uyanma, ölüm, merdiven, yatma geçişi, ayak IK'sı (basamak), zombi durumları |
| `nature` | orman, çayır, tarla, dağ, şehir caddesi/bulvarı/tepeden/cepheler, mahalle: çizim çağrısı, üçgen, bitki bantları |
| `living` | karga sürüleri, duman sütunları, gürültüyle ürkme |
| `lineup`, `regions` | karakter dizilimi (durumlar, tutuşlar), bölgeler (görsel) |
| `carry` | kutu alma (kinematik gövde), veranda basamağında taşımayı sürdürme, taşıma görseli konumu, fırlatma |
| **yeni** `carry-mp` | çok oyunculu taşıma: host istemcinin taşıdığını görür, fırlatılan kutu iki tarafta aynı yerde durur, aynı anda alma çakışmasında tek taşıyıcı, taşıyan ayrılınca kutu düşer |
| Geliştirici araçları | `tools/dev/drawcall-probe.mjs` (sistem başına çizim çağrısı dökümü, gölge geçişi ayrı), `merge-visual.mjs` (çatı kesiti, tabela atlası), `dressing-shots.mjs` (sokak dokusu), `carry-probe.mjs` (kare kare taşıma yüksekliği), `matlist.mjs` / `matfactors.mjs` (glb malzeme dökümü) |

## 2. Senaryolar ve sonuçlar

| Senaryo | Sonuç | Kanıt |
|---|---|---|
| Bekleme (kişiliğe göre kıpırdanma, yorgunluk) | ✅ | motion `idle`, birim testleri |
| Yürüme / koşu / depar, 8 yön, yan adım, geri | ✅ ayak kayması ölçülmüş adım mesafesiyle sınırlı | lineup, birim `faz hızı` |
| Eğilme yürüyüşü, sürünme, yaralı sürünme | ✅ geçiş klipleriyle | lineup, motion `prone-enter` |
| Zıplama, iniş, takla, engel atlama, kenara tırmanma | ✅ | motion `actions3` |
| Merdiven yukarı/aşağı/bekleme, giriş/çıkış klipleri | ✅ hız 1,6 m/s | motion `climb` |
| Yüzme, sürüş, yolcu koltuğu, oturma | ✅ | lineup `swim/seat` |
| Eğim ve basamakta ayak yerleşimi | ✅ basamaktaki ayak 0,22 m yukarı, kalça dengeli | motion `ik-off`/`ik-on` |
| Eşya alma, arama, canlandırma, sargı, yeme/içme, çekiç, fırlatma, doldurma, vuruş, tekme | ✅ | motion `actions1/2/3` |
| Ölüm, uyku/uyanma, isabet tepkisi | ✅ | motion |
| NPC konuşma (oyuncuya döner, el kol hareketli bekleme) | ✅ | kod incelemesi |
| Zombi bekleme/yürüme/koşu/tırmalama/ısırma/kapı yumruklama/çığlık/ölüm | ✅ | motion `z-*` |
| Zombi YZ: görüş konisi + görüş hattı, duyma, son görülen yerde tahminli arama | ✅ | ai |
| Uzak oyuncu eylemleri (vuruş, alma, doldurma, atlama, arama…) | ✅ | multiplayer-local |
| Kamera: yumuşak takip, engel, duruş geçişi, depar FOV | ✅ | smoke, gameplay |
| Hafif nesne taşıma (al, taşı, bırak, fırlat) | ✅ görsel taşıyanın 0,70 m önünde, 1,00 m yukarıda (gecikmesiz) | `carry` |
| Taşırken veranda basamağı | ✅ **düzeltildi** (önce basamakta "havada" sayılıp kutu düşüyordu) | `carry` (mode: ground, carrying: true) |
| Çok oyunculu taşıma | ✅ host istemcinin taşıdığını görür; fırlatılan kutunun son konumu iki tarafta aynı (fark 0,00 m); aynı anda almada tek taşıyıcı; taşıyan ayrılınca kutu düşer | `carry-mp` |
| İçeri girince çatı kesiti (birleşik çatılar) | ✅ gölgelendiricide kırpılır, iç mekân görünür | `merge-visual` (mv-home-inside) |
| Tabela atlası (ışıklı dükkân tabelası gece, ahşap levha) | ✅ yazılar okunur, dükkân tabelası gece ışıklı, levha ışımaz | `merge-visual` (mv-sign0/1) |
| Birleştirilmiş park araçları | ✅ renk, cam, lastik, far görünümü korunur | drawcall-probe ekran görüntüleri |
| İç mekân ayıklaması | ✅ **düzeltildi** (önceki tur etkisizdi, bkz. §4) — iç yüzeyler 64 m hücrelerde, 45 m ötede gizli | `merge-visual` (122 iç hücre, evde 6'sı görünür) |
| Kıyamet sonrası sokak dokusu | ✅ ~4.600 iz, ~780 ot, ~390 çöp torbası, yanmış enkazlar, boyanmış SOS | `dressing-shots` |
| Bina cepheleri yaşlanma | ✅ zemin bandında kir; ~760 cephe izi (grafiti, X işareti, afiş, akıntı, is, çatlak, boyalı uyarı), kapı/pencereyle çakışmaz | `dressing-shots` (fac-*) |
| Arızalı sokak lambaları | ✅ ~%10 sönük, ~%14 titrek | `dressing-shots` (gece) |
| Bitki örtüsü LOD + uzak kartlar, gece/gün batımı/ortam ışığı, araç lambaları | ✅ | nature, taillight-shot |

## 3. Ölçümler

**Animasyon (CPU, kare başına):** karakter ~0,05–0,1 ms, zombi ~0,02–0,04 ms.

**Çizim çağrıları — varsayılan oyuncu ayarları** (orta kalite, gölgeler açık; `tools/dev/drawcall-probe.mjs`,
gölge geçişi dahil):

| Görünüm | Önce | Sonra | Değişim |
|---|---|---|---|
| Şehir cephesi | 1.144 | 417 | −%64 |
| Şehir (tepeden) | 887 | 397 | −%55 |
| Mahalle | 437 | 279 | −%36 |
| Şehir caddesi (gerçek cadde) | 488* | 383 | −%22 |

\* Ölçüm aracının eski "şehir caddesi" konumu bir binanın içindeydi; cadde değeri yeni konumda, ilk iyileştirme
adımından sonra alındı. Sokak dokusu eklendikten sonra (ot ve izler) şehir görünümleri ~+25 çağrı.

En çok kazandıran adımlar: park araçları 152 → 23 (düz renk pişirme), çatılar 168 → 40 (birleştirme), iç mekân
eşyaları 114 → 2–8 (yakın hücreler), tabelalar 30+ → 2 (atlas), kabuklar 121 → 61 (512 m parça).

**Test ayarlarında** (`nature` senaryosu: düşük kalite, gölgesiz): şehir cephesi 734 → 373, şehir tepeden
589 → 323, mahalle 246 → 186 çağrı.

**İndirme boyutu (bu turun varlıkları):** karakterler 3,4 MB, animasyon paketleri 1,2 MB, doğa kiti 4,3 MB, şehir
kiti 2,0 MB, yüzey dokuları 0,34 MB. Sokak dokusu ve tabela atlası çalışma anında üretilir (indirme yok).

## 4. Bu turda bulunup düzeltilen hatalar
- **İç mekân ayıklaması etkisizdi (önceki turun hatası):** `cullInteriors`, birleştirilmiş kabuklardan sonra
  sahneden çıkarılmış bina başı ağların görünürlüğünü değiştiriyordu; çizilen birleşik ağlar hiç gizlenmiyordu.
  Önceki raporda "✅ yeni" olarak yazılan satır yanlıştı. Artık iç yüzeyler 64 m hücrelerde ayrı birleşiyor.
- Taşınan kutu veranda/kaldırım basamağında düşüyordu (kısa "havada" durumu taşımayı bitiriyordu).
- Taşınan kutu bir kare geriden geliyordu (kinematik hedef fizik adımından önce, eski konumla veriliyordu).
- Uyuyan kinematik gövde hedef verilince uyanmıyordu (oyuncu durup yeniden yürüyünce kutu yerde kalabilirdi).
- Çok oyunculu taşıma yoktu: uzak oyuncunun elindeki kutu diğer istemcilerde yerde duruyordu.
- Tabela kenar yüzlerinin UV'si indeksli geometride iki kez dönüştürülüyordu (geliştirme sırasında yakalandı).
- Geliştirme sunucusu 2 saatlik arka plan sınırında kapanınca testler "bağlantı reddedildi" ile düşüyordu:
  `tools/e2e.mjs` artık kendi sunucusunu açıp kapatıyor.
- Senaryo koşucusu tarayıcı kapanınca/çökünce "OK" diyordu → hata sayıyor (önceki adım).
- Önceki tur: animasyon aktarımında dinlenme pozu, tek seferlik kliplerin başa sarması, meshopt nicemlemesi,
  fantastik yaprak renkleri, siyah bitkiler, uzak kart saydamlığı, pastel arazi, kapı açma klibi.

## 5. Regresyon (tam koşu)

Tam koşu sonuçları aşağıda (bkz. `tools/e2e.mjs` özeti). Koşu sürüyor; bu bölüm koşu bitince güncellenecek.

<!-- REGRESSION -->
| Senaryo | Sonuç | Süre |
|---|---|---|
| ai | ✅ | 76 sn |
| audio | ✅ | 84 sn |

## 6. Hâlâ eksik olanlar / geliştirilmesi gerekenler (öncelik sırasıyla)
1. **Bina cephe geometrisi:** kir, is, grafiti, afiş ve akıntı katmanı eklendi; ama girilebilir binalar hâlâ
   kutu biçimli: pencere söveleri/denizlikleri, korniş, kat silmeleri, balkon, yangın merdiveni, tente gibi
   kabartmalı cephe parçaları yok. Görsel kalitedeki en büyük açık bu. Downtown kit binalarına (girilemeyen)
   cephe izi eklenmedi (açıklık bilgisi yok).
2. **Kit binalarının malzemeleri:** Downtown binaları model başına ~10 dokulu malzeme (şehirde ~60 çağrı); doku
   atlası ya da doku dizisiyle (texture array) tek malzemeye indirilebilir. Bina kabukları için de aynı yöntem
   (~60 → ~15 çağrı).
3. **Fizik etkileşimleri:** menteşeli kapı/çekmece fiziği, kırılabilir cam/ahşap/çit, itilebilir ağır nesneler
   (taşınamayanlar) yok; geç katılan oyuncu o an taşınan nesneyi yerde görür (anlık görüntüye eklenmeli).
4. **Araçlar:** iç mekân/direksiyon yok, kapı/bagaj animasyonu yok, yanmış enkaz yalnız renk (ezik/kırık cam yok).
5. **Silah animasyonları:** tüfek için klip yok (UAL'de yok); tabanca klipleri tutuş ofsetleriyle eşlenmedi.
6. **Kapı/çekmece için özel klip** yok (genel "Interact").
7. **Yaşayan dünya:** sallanan tabelalar, kuşların yere konması, su yüzeyi ve ıslak zemin yansımaları, rüzgârla
   uçuşan kâğıtlar eksik.
8. **Çim yoğunluğu:** yakın planda yoğun çim (GPU örnekli kart çim) yüksek kalitede eklenmeli.
9. **Gerçek donanım FPS ölçümü:** test ortamı yazılım GPU'su; hedef cihazlarda kare süresi ölçülüp kalite ön
   ayarları kalibre edilmeli (çizim çağrısı artık şehirde ~400, üçgen ~2,5–3 M: orta seviye dizüstü için
   üçgen tarafı da izlenmeli).

## 7. Sonraki tur için bulunan ücretsiz (CC0) varlık adayları
| Açık | Aday | Lisans / biçim | Not |
|---|---|---|---|
| Cephe parçaları (pencere, kapı, duvar modülleri) | [Kenney Building Kit](https://kenney-assets.itch.io/building-kit) | CC0, glTF (80+ model; animasyonlu kapılar dahil) | girilebilir binaların pencere/kapı söveleri için |
| Çok katlı bina modülleri | [Kenney Modular Buildings](https://kenney-assets.itch.io/modular-buildings) ([OpenGameArt](https://www.OpenGameArt.org/content/modular-buildings)) | CC0, glTF (~90–100 model) | Downtown silüetini çeşitlendirmek için |
| Tüfek/silah tutuş animasyonları | Quaternius Toon Shooter Game Kit ([BlenderNation](https://bazaar.blendernation.com/listing/toon-shooter-game-kit/)) | CC0, glTF/FBX/Blend (karakterler + 17 animasyon + silahlar) | kemik yapısı indirilip doğrulanmalı; aktarım hattımız (tools/retarget-ual.mjs) uyarlanabilir |
| Tente, yangın merdiveni | Hazır CC0 glTF bulunamadı | — | prosedürel üretilecek (Geo kutuları + metal malzeme) |
