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
_(aşamalar ilerledikçe doldurulur)_

## 3. Düzeltilen sorunlar
_(aşamalar ilerledikçe doldurulur)_

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

## 6. Test edilemeyenler
- Gerçek internet üzerinden WebRTC/TURN bağlantısı (ortam ağ kısıtı).
- Gerçek GPU kare hızı (yazılım GPU'su; ölçümler çizim çağrısı/üçgen/CPU ile sınırlı).
- Hoparlörden ses ve fare işaretçi kilidi (başsız tarayıcı).
