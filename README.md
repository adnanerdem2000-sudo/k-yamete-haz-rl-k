# KIYAMETTEN ÖNCE — 30 Gün Kaldı

> 30 günün kaldı. Arkadaşlarını topla. Hazırlan. Hayatta kal.

2–6 oyunculu, üçüncü şahıs kameralı, açık dünya **co-op hayatta kalma** oyunu. Bir ada, 30 gün sonra
"Son Işık" denen felaketle yutulacak. Takımınla kaynak topla, evini bir kaleye çevir, Proje Kızılçam'ın
gizemini çöz ve yedi kaçış yolundan birini hazırla. Oyun **tarayıcıda** çalışır (kurulum gerekmez); masaüstü `.exe` sürümü
için yol haritası `docs/ROADMAP.md` içinde.

![Konsept](assets/img/keyart.jpg)

## ✨ Neler var?

- **2 × 2 km ada, 18 bölge:** mahalle, şehir merkezi, hastane, liman, sanayi, askerî bölge, laboratuvar, orman,
  dağ kampı ve yeni eklenen **çiftlik köyü, deniz feneri, sahil tatil köyü, cezaevi, havaalanı, dağ köyü
  (cami), baraj ve santral, anakara köprüsü**. Göller, baraj gölü, boğaz ve anakara kıyısı.
- **Her binaya girilebilir:** şehir silüetindeki 11 kule (zemin katları: kafe, market, klinik, daire…), mahalle
  evleri ve dağ köyü camisi dahil adadaki 86 binanın hepsine kapıdan yürüyerek girilir.
- **Gerçekten açılan dolaplar:** ararken gardırop ve dolap kanatları, buzdolabı ve fırın kapakları, sandık kapakları
  menteşesinden açılır (görsel; çarpışma almaz), şifonyer, komodin, masa ve dosya dolabı çekmeceleri fizikli olarak
  dışarı kayar; aranmış dolap aralık kalır; çok oyunculuda başkasının açtığı dolabı herkes görür.
- **Kullanılabilir araçlar:** yolda terk edilmiş 23 araba artık gerçek araç: öbür sürülebilir araçlar gibi binilip
  sürülür (az yakıt, bazılarında patlak lastik ya da bitik akü), bagajları yağmalanır. Kaza yerlerindeki yanmış
  arabalar ve birkaç dekor araç (benzinlikteki tanker, havaalanındaki itfaiye aracı gibi) binilemez.
- **Gündüz yağma, gece zombi:** zombiler alacakaranlıkta (20.30) oyuncuların çevresinde topraktan çıkar, şafakta
  (06.00) toprağa geri döner. Gündüz başka tehlikeler var: yağmacı devriyeleri, başıboş köpek sürüleri, öğle güneşinde
  güneş çarpması. Gece açıkta uyumak zor; sığınakta ya da savunmalı üste uyku hızlı geçer.
- **Yer altı sığınakları (haritada 🕳️):** şehir halk sığınağı, hastane bodrumu ve morg, askerî komuta sığınağı
  (levye), çiftlik fırtına mahzeni, orman mağarası (ip merdiven), fener mahzeni, eski maden galerisi ve laboratuvar
  B1 katı (anahtar kartı). Girişte E'ye basılı tutunca ekran kararıp merdivenin dibine inilir (yürüyerek inme
  animasyonu yok); içeride ganimet ve jeneratörle yanan ışıklar var, şehir ve askerî sığınakta ranzalar, fener
  mahzeninde ve orman mağarasında birer yatak bulunur (öbür dördünde uyumak için uyku tulumu gerekir). Zombiler aşağı
  inemez, takip eden YZ arkadaşların seninle iner.
- **Hikâye:** 30 günlük takvim, **45 rastgele olay** (paraşütlü yardım paketi, alevler içinde düşen uçak,
  Kanlı Ay, kurt sürüsü, sis, sarsıntı, cezaevi isyanı, kaçak bilim insanı, kablo hırsızları…), **14 NPC**
  (Pilot Aydın, Fener Bekçisi İsmail, Mühendis Zeynep, Muhtar Ömer, Gardiyan Necla, Murat ve Defne…) ile
  sohbet konuları ve ahlaki kararlar, 29 görev, 38 belge. Ana hikâye "Gerçeğin Peşinde" ve "Son Yayın" ile
  Kızılçam'ın sırrını anakaraya duyurmaya kadar uzanır; sonuç ekranında kararlarınıza göre bir **epilog** çıkar.
- **Zaman çizelgesi (J → Zaman Çizelgesi):** 30 günlük şerit; her günün olayları, kararlar, görevler,
  keşifler, kurtarmalar, sürüler ve kaçış hazırlıkları kronolojik olarak; yaklaşan takvim olayları ve Son Işık'a geri sayım.
- **Fizik (Rapier 3D):** sabit 60 Hz adım + enterpolasyon, kinematik karakter denetleyicisi, ışın tabanlı
  araç süspansiyonu (tutunma sınırlı direksiyon, fren, devrilme), itilebilir/patlayan nesneler, savrulan
  cesetler, kırılan kapı ve pencere enkazı, **halatla araç arkasına bağlanıp çekilen pist enkazları**,
  rüzgârla süzülen paraşütlü paketler, sarsıntıda zıplayan eşyalar.
- **Karakterler ve yaratıklar:** iskeletli Quaternius insan modelleri (klip + prosedürel katmanlı animasyon,
  takla, eğilme, yüzme, sürünme, tırmanma), iskeletli hayvanlar (kurt, geyik, erkek geyik, tilki, köpekler),
  yeni zombi türleri (sürünen, çığlıkçı, şişkin, çevik kuvvet) ve sürü taktikleri.
- **Ses:** HRTF 3B konumlandırma, duvar arkası boğuklaşma (oklüzyon), mesafeyle tiz kaybı, iç mekânda
  yankı, zemine göre ayak sesleri (çim, toprak, çakıl, kum, asfalt, ahşap, fayans, metal, su), dinamik
  prosedürel müzik + çatışmada CC0 savaş teması.

---

## ▶️ Hemen oyna (GitHub bağlantısı)

Depo herkese açık olduğu için iki yol var:

1. **Anında (kurulumsuz):** son sürümün commit kimliğiyle githack bağlantısı —
   `https://raw.githack.com/adnanerdem2000-sudo/k-yamete-haz-rl-k/<COMMIT>/index.html`
   (`<COMMIT>` yerine depo sayfasındaki son commit'in tam 40 haneli kimliğini yaz).
2. **Kalıcı adres (GitHub Pages, bir kez ayarlanır):**
   GitHub → depo → **Settings → Pages → Build and deployment → Source: "Deploy from a branch"** →
   Branch: `claude/kiyametten-once-game-0yng28`, klasör: `/ (root)` → **Save**.
   1–2 dakika sonra oyun şu adreste yayında olur:
   **https://adnanerdem2000-sudo.github.io/k-yamete-haz-rl-k/**
   (İstersen `main` dalına birleştirip `.github/workflows/pages.yml` iş akışını da kullanabilirsin.)

3. **Tek dosya (sunucu ve kurulum gerektirmez):** `npm run build:single` → `dist/KiyamettenOnce.html`
   (~45 MB; bütün kod ve varlıklar içine gömülü). Dosyayı bilgisayara kaydedip çift tıklamak yeterli; oyun
   tamamen çevrimdışı açılır (yalnız arkadaşlarla internet üzerinden oynamak bağlantı ister). Tarayıcılar
   `file://` altında modül/dosya yüklemeyi engellediği için oyunun varlık istekleri gömülü veriye yönlendirilir
   (`tools/build-single.mjs`).

Gereksinim: WebGL 2 destekli güncel bir tarayıcı (Chrome / Edge / Firefox / Safari 16+). Klavye + fare.

### Arkadaşlarla oynamak
**Arkadaşlarla Oyna → Oda Kur** → 6 haneli oda kodunu ya da **Davet Bağlantısı**'nı arkadaşına gönder →
arkadaşın **Odaya Katıl**'dan kodu girer (ya da bağlantıya tıklar) → herkes karakter seçip **Hazırım** der →
oda sahibi **Oyunu Başlat**. Bağlantı eşler arası (WebRTC / PeerJS) kurulur, sunucu kurmana gerek yoktur.
Lobide **Sesli sohbeti aç** ile mikrofonu aç; oyunda **V** tuşuna basılı tutarak konuş. Ses yakınlık sesidir
(35 m'ye kadar, yönlü); iki tarafta da **telsiz** varsa mesafe sınırı yoktur.

- **Bağlantı göstergesi:** HUD'daki ağ simgesi gecikme (ms) ve paket kaybını gösterir (yeşil/sarı/kırmızı).
- **Kopma / host göçü:** Bağlantı koparsa oyun otomatik yeniden bağlanmayı dener; oda sahibi gerçekten
  düşmüşse sıradaki oyuncu aynı oda koduyla yeni oda sahibi olur ve oyun dünyası (zombiler, kapılar, taşınan
  eşyalar, envanterler) kaldığı yerden sürer.
- **Kurumsal/mobil ağ (TURN):** Bağlantı kurulamıyorsa kendi TURN sunucunu **Ayarlar → Oyun → TURN sunucuları (JSON)**
  alanına JSON olarak gir (`[{"urls":"turn:sunucu:3478","username":"...","credential":"..."}]`). Kimlik
  bilgileri yalnız bu tarayıcıda saklanır; oyuna gömülü değildir.

> Aynı bilgisayarda iki sekmeyle denemek için "Bağlantı: **Yerel test**" seçeneğini kullan.

### Grafik kalitesi ve performans testi
**Ayarlar → Grafik → Kalite**: *Düşük* (zayıf ekran kartları), *Orta* (orta seviye bilgisayarlar), *Yüksek*
(güçlü ekran kartları), *Ultra* (ortam kapanması/AO ve gerçek su yansımaları). Seviye seçilince gölge, bitki örtüsü,
çözünürlük, AO, su ve efekt ayarları birlikte değişir; sonra tek tek değiştirilebilir. **Performans göstergesi**
açılırsa ekranda FPS, kare süresi, %1 low, CPU/GPU süresi, çizim çağrısı, üçgen, zombi ve fizik nesnesi sayısı görünür.
Orta ile Ultra'nın karşılaştırması: `docs/img/kalite-orta-ultra-*.jpg`.

Kendi bilgisayarında ölçmek için tek oyunculu bir oyunda **Duraklat → Ayarlar → Grafik → Performans testini başlat**
(~45 sn): oyun şehir merkezi, orman, üs ve 40 zombilik bir sürüyü sırayla ölçer, sonucu tablo olarak gösterir;
**Sonucu kopyala (JSON)** ile paylaşabilirsin. Test sırasında karakterin ve takım arkadaşların hasar almaz, otomatik
kayıt sona ertelenir; araçtayken başlamaz. Tarayıcıda donanım hızlandırması kapalıysa (yazılım GPU'su) sonuç
tablosunda uyarı çıkar: o değerler ekran kartının gerçek performansı değildir.

---

## 💻 Yerelde çalıştırma (geliştirme)

```bash
npm install                           # araçlar ve testler (oyunun kendisi bağımlılık gerektirmez)
npx playwright install chromium       # yalnız testler için, bir kez (uçtan uca testlerin tarayıcısı)
npm start                             # http://localhost:8080
```

`npm start` yerine herhangi bir statik sunucu da olur (ör. `python3 -m http.server 8080`). Dosyayı
doğrudan `file://` ile açma: tarayıcılar ES modüllerini ve model dosyalarını o şekilde yüklemez.

### Testler

```bash
npm test             # birim testleri (envanter, ihtiyaçlar, zaman, animasyon paketi, hareket, parça birleştirme, cephe, ağ, kalite/performans ölçer…)
npm run test:e2e     # tüm uçtan uca senaryolar sırayla (kendi sunucusunu açar; başsız Chromium + Playwright)
node tools/e2e.mjs story carry-mp             # seçili senaryolar (günlük: /tmp/e2e-<ad>.log)
node tools/scenario.mjs tests/e2e/story.mjs   # tek senaryo, elle açılmış sunucuya (`npm start`) karşı
node tools/e2e.mjs visual                     # görsel regresyon: 14 görüntü Orta kalitede, tests/visual/baseline ile
VISUAL_BASELINE=1 node tools/e2e.mjs visual   # görsel tabanı yeniden al (başka GPU'da gerekir)
VISUAL_QUALITY=ultra node tools/e2e.mjs visual  # o kalitede görüntü al, karşılaştırma yok (/tmp/visual-ultra/)
```

Ayrıntılar: [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md). Her gönderimde GitHub Actions (`.github/workflows/ci.yml`)
birim testlerini ve kısa uçtan uca duman testlerini (gerçek fare tıklamalı menü dahil) koşar.

---

## 🎮 Nasıl oynanır?

| Tuş | Eylem | Tuş | Eylem |
|---|---|---|---|
| W A S D | Hareket | Fare | Kamera / nişan |
| Shift | Koş | Sol tık / Sağ tık | Vur-ateş / nişan al |
| C / Z | Eğil / Sürün | Boşluk | Zıpla, tırman |
| **E (basılı tut)** | Ara, aç, tamir, kaldır | R | Şarjör / yaralı arkadaşı sırtla-bırak |
| 1–6, tekerlek | Hızlı erişim | Tab | Envanter |
| K | Üretim | B | Üs geliştirme (inşa) |
| M | Harita | J | Görevler / takvim / kaçış planları |
| O | Karakter | P | Takım (YZ emirleri, davet, ses) |
| F | El feneri (araçta far) | Q | İşaret (ping) |
| V | Bas-konuş | T | Sohbet |
| G | İfade çarkı | H | Hızlı tedavi (araçta korna) |
| X | Elindekini bırak | Esc | Menü |

Tüm tuşlar **Ayarlar → Kontroller**'den değiştirilebilir.

**Temel döngü:** Gündüz keşfe çık ve yağmala (zombi yok ama yağmacılar, başıboş köpekler ve öğle güneşi var) →
20.30'dan önce üsse ya da bir yer altı sığınağına dön, pencereleri tahtayla güçlendir, barikat kur → gece zombiler
topraktan çıkar; korunaklı yerde uyuyarak zamanı hızlandır (oyuncuların yarıdan fazlası yatmalı, iki kişide ikisi de; YZ arkadaşlar sayılmaz; açıkta uyku yavaş geçer) →
takvim olaylarına, rastgele olaylara ve sürülere hazırlan → 30. gün 22:00'ye kadar bir kaçış yolu hazırla.

**Finaller (Görevler → Kaçış Planları):** Yeraltı sığınağı · Askerî helikopter (30. gün 20:00) ·
Martı teknesi (fener yanarsa açıktaki yük gemisine) · Dağ kampı · Köprüden araç konvoyu (30. gün 21:00) ·
**Uçakla kaçış** (Pilot Aydın'ı iyileştir, uçağı onar, 60 L yakıt taşı, pisti enkazlardan temizle) ·
Son savunma. Sonuç ekranında hayatta kalanlar, üs seviyesi, kararlarınız, S–D derecesi ve epilog gösterilir.

**Yan hikâyeler:** Santralde türbini yeniden çalıştırıp adaya elektriği geri getir (sokak lambaları,
benzin pompaları) · Deniz fenerini yak, açıktaki gemiyle haberleş · Otel Mavi Koy'daki baba-kızı üsse
eskort et (tamirci Murat araç onarımını güçlendirir) · Dağ köyünü hastalıktan kurtar (köy pazarı açılır) ·
Cezaevindeki mahkûmların kaderine karar ver · Kanıtları toplayıp 147.30'dan gerçeği yayınla.

---

## 📁 Klasör yapısı

```
index.html                 giriş sayfası (import map, yükleme ekranı)
src/
  main.js, Game.js         önyükleme, ana döngü, menü sahnesi (gün batımında üs)
  Session.js               oturum: host-otoriter eylem/olay hattı, ihtiyaçlar, uyku, kayıt
  core/                    grafik (Three.js + son işlem), giriş, ayarlar, varlık yükleyici, yardımcılar
  world/                   ada arazisi, yollar, köprü, girilebilir binalar + iç mekân, yer altı sığınakları,
                           bitki örtüsü, su, gökyüzü, çarpışma dünyası, yol bulma ızgarası (A*)
  physics/                 Rapier 3D dünyası: sabit adım, enterpolasyon, karakter denetleyicisi, dinamik nesneler
  entities/                iskeletli karakterler (klip + prosedürel katmanlar), oyuncu, zombi ve hayvan görünümleri
  systems/                 envanter, ihtiyaçlar, zaman, ortam/hava, yağma, üretim, inşa, zombiler, savaş, araçlar,
                           NPC/hayvanlar, görevler, olaylar, finaller, harita, YZ takım arkadaşları, kayıt, ses,
                           zaman çizelgesi, hikâye dünyası (pist enkazları, uçak, fener, gemi, paket, düşen uçak)
  net/                     oda/lobi, taşıyıcılar (PeerJS + BroadcastChannel), sesli sohbet
  ui/                      arayüz yöneticisi, menüler, HUD, günlük (envanter/üretim/karakter/görevler/harita), paneller
  data/                    eşyalar, tarifler, yapılar, yağma tabloları, zombiler, hikâye (takvim, olaylar, görevler)
assets/                    CC0 modeller (GLB kitleri), sesler, yazı tipleri, konsept görselleri
vendor/                    three.js r187 (MIT), PeerJS 1.5.5 (MIT), Rapier 3D (Apache-2.0), meshoptimizer çözücü (MIT)
tests/unit, tests/e2e      birim + uçtan uca testler
tools/                     yerel sunucu, varlık paketleyici, senaryo koşucu, ekran görüntüsü aracı
docs/                      mimari, test raporu, bilinen sorunlar, yol haritası
```

Mimari ayrıntıları: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Bilinen sorunlar:
[`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) · Sonraki aşamalar: [`docs/ROADMAP.md`](docs/ROADMAP.md) ·
Krediler ve lisanslar: [`CREDITS.md`](CREDITS.md)
