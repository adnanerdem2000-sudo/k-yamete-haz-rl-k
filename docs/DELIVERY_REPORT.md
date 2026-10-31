# Teslim Raporu — "Next Level 2.0" turu

Bu belge turun sonunda tamamlanır. Her aşama bitince ilgili bölüm doldurulur; **test edilemeyen sistemler
ayrıca işaretlenir**, hiçbir şey yalnızca derlendiği için "tamamlandı" sayılmaz.

## 1. Başlangıç mimarisi (tur başı, commit `bf132f4`)
- Three.js r187 (vendor), Rapier 3D (compat, vendor), ES modülleri, derlemesiz statik site; PeerJS/WebRTC +
  BroadcastChannel yerel taşıyıcı; host-otoriter eylem/olay hattı (`Session.act/emit`).
- Karakterler: Quaternius Ultimate Modular Men/Women tabanı, 154 klip (`.kan` paketleri), `Motion`
  (8 yön, faz eşitlemeli döngüler, maskeli tek seferlikler), `FootIK`.
- Dünya: 2×2 km ada, 18 bölge, prosedürel binalar (`BuildingGen`), Stylized Nature MegaKit bitki örtüsü
  (bantlı LOD + uzak kartlar), Downtown City kiti silüeti, sokak dokusu (`Dressing`), yaşayan dünya
  (kargalar, duman), statik birleştirme (kabuk/çatı/tabela/kit parçaları).
- Fizik: sabit 1/60 adım, kinematik karakter denetleyicisi, ışın tabanlı araçlar, dinamik nesneler, taşıma.
- Testler: 31 birim testi, 18 uçtan uca senaryo (17 + `ui-clicks`), kendi sunucusunu açan koşucu
  (`tools/e2e.mjs`); Playwright yalnız global kurulumdan yükleniyordu (bu turda düzeltildi).
- Yayın: GitHub Pages "Deploy from a branch" (`claude/kiyametten-once-game-0yng28`), tek dosyalık sürüm
  (`npm run build:single`).

### Başlangıç test durumu (31 Ekim 2026)
| Katman | Sonuç |
|---|---|
| `npm test` | 31/31 |
| `npm run test:e2e` (17 senaryo, sırayla) | 17/17 (ilk koşuda `living` ve `multiplayer-local` eşzamanlı başka bir tarayıcıyla çakışıp düştü, tek başına geçti) |
| `ui-clicks` (gerçek fare) | geçti |
| Tek dosya (`file://`) | menü 15 sn, oyuna giriş, dış istek yok |

### Başlangıçta bilinen açıklar (QA_REPORT §6)
Cephe geometrisi kutu biçimli; kit binaları çok malzemeli; menteşeli kapı/çekmece/kırılabilir çevre yok;
araç iç mekânı ve hasar görseli yok; tüfek klibi yok; host göçü ve TURN yok; sesli sohbet 3B değil; gerçek
donanım FPS ölçümü yok; botlar yağma/inşa yapmıyor; kalabalık sürülerde zombi takılması.

## 2. Tespit edilen sorunlar
- **Etkileşim adaylarındaki uzaklık alanı kapı nesnesini eziyordu** (`t.d`): E ile kapı açma sessizce çalışmıyordu
  (taşıma sistemi eklenirken girdi; yayındaki sürümü de etkiliyordu). Aşama 2'de bulundu.
- **Rapier `addForce` kalıcı**: su kaldırma kuvveti her adımda birikip nesneleri fırlatıyordu. Aşama 3'te bulundu.
- **Kapı itme algılayıcısı** kapat komutunu geri alıyordu (motor kapatırken "itildi" sanıyordu). Aşama 3.
- **Eşya simgeleri eşzamanlı GPU çizimi**: envantere eşya girince HUD bildirimi için simge o anda GPU'da çizilip
  geri okunuyordu (`readRenderTargetPixels`). Oyun mantığının içinde (görev ödülü → `grant`) ve özellikle testlerin
  sıkı adım döngülerinde yazılım GPU'sunda saniyeler sürüyor, tarayıcı render süreci 7 GB'ı aşıp çöküyordu
  (`story` senaryosu). Donanım GPU'da fark edilmez ama ilk görülen eşyada tek karelik takılma yapıyordu.
- **Bitki örtüsü yeniden kurulumu**: iki çağıranın farklı görüş mesafesi vermesi her karede tam yeniden kuruluma
  yol açıyordu (sabit kare çizen testler). Yazılım GPU'sunda GPU belleği şişiyordu.
- **Zamanlama denetimleri duvar saatiyle**: yavaş karelerde etkileşim testi yanlış negatif veriyordu.

## 3. Düzeltilen sorunlar
- `Interact.findTarget`: uzaklık alanı `dist` oldu; `interact` senaryosu kapı adımı bunu yakalar.
- `Buoyancy`: her adımda `resetForces`. `DoorPhysics`: komuttan sonra 2 sn itme sayılmaz.
- `IconRenderer.iconInto` + `flush`: simgeler kuyruğa alınır, `Game.loop` karede en fazla bir simge çizer; `<img>`
  hazır olunca güncellenir. `story` senaryosu render süreci 2,5–3,1 GB'da sabit, 0 hata.
- `Vegetation.update`: parametre değişse de en sık 0,2 sn'de bir kurulum (kamera 50 m sıçramadıkça).
- `interact` / `physics2` senaryoları simülasyon zamanıyla ölçer; `physics2` adım/sn denetimi yazılım GPU'sunda
  bilgi amaçlı.

## 4. Değiştirilen dosyalar ve eklenen sistemler
_(aşamalar ilerledikçe doldurulur)_

## 5. Aşama raporları
### Aşama 1 — Test ve güvenlik
- Playwright `package.json`'a eklendi (`^1.63.0`); `tools/scenario.mjs` yerel kurulumu, yoksa global kurulumu
  kullanır. Temiz kurulum: `npm install && npx playwright install chromium`.
- `.github/workflows/ci.yml`: her gönderimde birim testleri + `smoke-menu` ve `ui-clicks` (gerçek tıklama);
  elle tetiklemede tam takım; günlükler ve ekran görüntüleri artefakt olarak saklanır.
- Pages yayın dalı ile CI aynı gönderimlerde koşar (yayın "Deploy from a branch" olduğu için testler yayını
  engellemez; durum rozeti verir).
- `TEST_REPORT.md` sayıları gerçek değerlerle eşlendi (23 → 31 birim testi), `KNOWN_ISSUES.md` çizim
  çağrısı bilgisi güncellendi.

### Aşama 2 — Karakter kalitesi
- **Yüz:** göz akı + iris + göz bebeği + parıltı + kapak çizgisi + dudaklar; konumlar kafa setinin geometrisinden
  ölçülür (göz/ağız yuvaları), tek ağ (karakter başına +1 çizim çağrısı). Saçta kök–uç tonu ve tel tel fark;
  yüzde hafif ten varyasyonu. Deri malzemesine köşe başına pürüzlülük (ten yarı mat, göz ıslak, kumaş mat).
- **Kıyafet koleksiyonları:** 8 koleksiyon artık gerçek modüler set değişikliği (cinsiyete göre) + renk/aksesuar;
  yüz/saç korunur. Nadir kombinasyon testi: 63 erkek + 40 kadın kafa×gövde kombinasyonunun hepsinde boyun ve bel
  birleşimi ölçüldü, görünür boşluk yok (`tools/dev/outfit-combos.mjs`).
- **Kişilik:** oyun içinde boş beklerken Mert anahtar kurcalar, Elif dürbünle bakar, Bora gerinir, Deniz gard alıp
  yumruk atar, Ceren saate bakar, Zülal ayak ucunda etrafı kolaçan eder (aletler eşya modelinden, elde belirir).
  Zamanlayıcı testi: 0,2 sn sonra tetiklendi, yürüyünce kesildi (`motion` senaryosu `kıpırdanma`).
- **Etkileşim:** oyuncu önce hedefe döner; yerden alma eşyayı eğilme anında ekler (0,1 sn'de envanterde yok,
  1,1 sn'de var; yaw 0 → 1,17 rad, hedef 0,95 ± 0,45), kapı el kola değince hareket eder (E'den 0,1 sn sonra
  target 0, 0,84 sn sonra target 1 / open01 0,99; oyuncu kapıya döndü: yaw 2,33, hedef 2,28) — `interact`
  senaryosu, son koşu 0 hata.
- **Bulunan ve giderilen gerileme:** taşıma sistemi eklenirken etkileşim adaylarına yazılan uzaklık alanı (`d`)
  kapı nesnesini (`t.d`) eziyordu → E ile kapı açma sessizce çalışmıyordu (yayındaki sürümde de). Alan `dist`
  oldu; `interact` senaryosu kapı adımı artık bunu yakalar.
- **Ayak IK'sı eğimde:** `motion` senaryosuna 15–30° yamaç testi eklendi (iki bileğin zemine göre yüksekliği).
- Kıyafetlerde dikiş/kumaş dokusu ve normal haritası: **yapılmadı** (modüler tabanın UV'si yok; köşe renkleriyle
  çalışıyor). Daha kaliteli saç geometrisi: **yapılmadı** (taban modelin saçı, ton gradyanıyla iyileştirildi).

### Aşama 3 — Fizik
- **Menteşeli kapılar:** 199 bina kapısı (ahşap/metal/lab) dinamik kanat + dönel eklem; E motoru sürer, yürüyerek
  itilir (itilince durum host'a gider), kilitli/barikatlı sabit, kırılınca eklem kopar ve kanat düşer; zombi
  yumruğunda sarsılır. Garaj/kasa/hücre/cam kapılar eski (kinematik) yolda kaldı. `physics2` senaryosu: aç →
  open01 1; kapat → 0,12; iterek aç → open01 1 ve durum eşitlendi (target 1); kilitli kapı 400 N·s itkiye sabit;
  kırılma → eklem yok, kanat 7,41 → 6,33 m'ye düştü. **Bulunan hata:** itme algılayıcısı, kapat komutundan hemen
  sonra motor kapatırken "oyuncu itti" sanıp kapıyı yeniden açıyordu → komuttan sonra 2 sn itme sayılmaz.
- **Çekmeceler:** şifonyer, komodin, masa, dosya dolabı, tezgâh… konteynerlerinde kayar eklemli çekmece;
  aranırken/panel açıkken dışarı kayar, kapanınca içeri; oyuncu iterse kapanır. Oyuncuya yakın en fazla 14 aktif.
- **Su:** dinamik nesnelere yoğunluğa göre kaldırma kuvveti, su direnci, dalga ve doğrultma. **Bulunan hata:**
  Rapier'de `addForce` kalıcıdır; ilk sürümde kuvvet her adımda birikip nesneleri fırlatıyor ve simülasyonu
  kasıyordu → her adımda `resetForces`.
- **Çarpışma sesleri:** temas kuvveti olaylarından malzemeye (metal/ahşap/plastik/cam/gövde) ve şiddete göre sentez
  ses; gövde başına 0,22 sn, adım başına ≤ 4 ses. Enkaz ağları havuzlanır (nesne yeniden kullanımı). Test: düşen
  varil → metal darbe şiddet 1 / 0,8 / 0,69, düşen kutu → ahşap 0,6 / 0,73; su: kutu 4 sn sonra y 4,13 (su 4,2);
  çekmece panel açılınca 0,339 m dışarı, kapanınca 0,001 m.
- **Test ortamı notu:** yazılım GPU'sunda `physics2` koşusunda kare süresi saniyelere çıktı (fizik 2–3 adım/sn;
  simülasyon doğru ama yavaş); senaryo beklemeleri fizik adımıyla ölçüldüğü için sonuçlar geçerli, "sim hızı"
  denetimi bu ortamda başarısız kalıyor (kare süresi sondası `tools/dev/perf-probe.mjs` ile inceleniyor).
- Araçla çite/duvara çarpınca yapı hasarı: **Aşama 5'e** (araç çarpışma modeli) bırakıldı.

### Aşama 4 — Harita ve çevre
- **Cepheler (`Facade`):** 69 binanın hepsine subasman bandı, saçak/korniş bandı; tuğla/beton/şehir sıvasında köşe
  taşları, düz çatıda korniş + kat silmesi + çatı boruları/kapak/su deposu, eğimli çatıda oluk + iniş boruları,
  ev stillerinde panjur (%75; açık/kapalı), tuğlada lento/kilit taşı, boş yan duvarlı yüksek şehir binasında yangın
  merdiveni, uydu anteni. Çatı çeşitliliği: 23 beşik, **10 kırma (yeni)**, 7 tek eğimli, 29 düz. Tabelalı
  dükkânların ön kapısı üstünde çizgili **tente** (%75; yırtık/sarkık çeşidi). Hepsi kabuk birleştirmesine girer →
  çizim çağrısı artmaz. Ekran görüntüleri: `/tmp/s4b-hip-house.png` (kırma çatı, subasman, panjur, veranda),
  `/tmp/s4b-brick-left.png` (korniş, köşe taşları), `/tmp/s4b-shop-awning.png` (tente).
- **İç mekânlar (`InteriorDress`):** bina durumu 24 yaşanır / 32 yağmalanmış / 13 barikatlı; perdeler, tavan
  lambaları (her odada; 'emissive' kovası), halılar, duvar resimleri, devrilmiş kutular; 795 zemin dağınıklık izi
  (kâğıt/çöp/cam/leke) iz atlasında; 125 pencere baştan kırık, 88 pencere baştan tahtalı (kayıt uyumlu: taban
  durumdan sapan pencereler kaydedilir, eski kayıtlar geçerli). Gece: 'emissive' malzemesi 1,0'a sürülür (test:
  gece 23:00'te `emissiveIntensity` 1) ve oyuncunun içinde bulunduğu binanın lambaları ışık havuzuna eklenir
  (5 lamba → 5 sıcak nokta ışığı; `/tmp/s4b-interior-night.png`).
- **Biyom bitki örtüsü (`BiomeScatter`):** orman dışındaki bölgelere temaya göre 1.553 ek örnek (dağ: çam/kaya/kuru
  ağaç; kıyı: çalı/kaya/kuru odun; çiftlik: çit çalıları; mahalle: bahçe çalısı/çiçek/kiraz; havaalanı/cezaevi:
  kuru ot/çakıl). Dağ platosunda 50 m karede 208 örnek (`/tmp/s4b-mountain.png`), kıyıda kayalar ve ot
  (`/tmp/s4-coast.png`).
- **Yaşayan dünya:** kuş sürüleri çatılara iner/tüner/havalanır (oyuncu 13 m'ye yaklaşınca ürker), 40 uçuşan kâğıt
  (esinti testinde 18'i havada), 19 asma dükkân tabelası (gölgelendiricide salınım). Yağmurda bina/yol
  malzemelerinin pürüzlülüğü düşer (ıslak parlaklık).
- **Doğrulama:** birim testler 35/35 (`facade.test.mjs` 4 test: subasman/panjur/oluk, korniş/köşe/yangın merdiveni,
  tente/kırma çatı, iç dekor + pencere durumları); görsel senaryolar `tools/dev/stage4-shots*.mjs` 0 hata.
- **Yapılmadı / kısmi:** PBR doku atlası ve ek PBR malzeme seti (mevcut nötr ayrıntı + normal haritası yolu
  korundu; yeni doku indirilmedi), balkon ve klima üniteleri cephelerde (yalnız düz çatı üstünde klima var),
  kuşların yere (çatı dışına) konması, yansımalı ıslak zemin (ekran uzayı yansıması yok; yalnız pürüzlülük).
## 6. Test edilemeyenler
- Gerçek internet üzerinden WebRTC/TURN bağlantısı (ortam ağ kısıtı).
- Gerçek GPU kare hızı (yazılım GPU'su; ölçümler çizim çağrısı/üçgen/CPU ile sınırlı).
- Hoparlörden ses ve fare işaretçi kilidi (başsız tarayıcı).
