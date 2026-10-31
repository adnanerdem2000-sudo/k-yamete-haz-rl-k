# KIYAMETTEN ÖNCE — 30 Gün Kaldı

> 30 günün kaldı. Arkadaşlarını topla. Hazırlan. Hayatta kal.

2–6 oyunculu, üçüncü şahıs kameralı, açık dünya **co-op hayatta kalma** oyunu. Bir ada, 30 gün sonra
"Son Işık" denen felaketle yutulacak. Takımınla kaynak topla, evini bir kaleye çevir, gizemi çöz ve altı
kaçış yolundan birini hazırla. Oyun **tarayıcıda** çalışır (kurulum gerekmez); masaüstü `.exe` sürümü
için yol haritası `docs/ROADMAP.md` içinde.

![Konsept](assets/img/keyart.jpg)

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

Gereksinim: WebGL 2 destekli güncel bir tarayıcı (Chrome / Edge / Firefox / Safari 16+). Klavye + fare.

### Arkadaşlarla oynamak
**Arkadaşlarla Oyna → Oda Kur** → 6 haneli oda kodunu ya da **Davet Bağlantısı**'nı arkadaşına gönder →
arkadaşın **Odaya Katıl**'dan kodu girer (ya da bağlantıya tıklar) → herkes karakter seçip **Hazırım** der →
oda sahibi **Oyunu Başlat**. Bağlantı eşler arası (WebRTC / PeerJS) kurulur, sunucu kurmana gerek yoktur.
Lobide **Sesli sohbeti aç** ile mikrofonu aç; oyunda **V** tuşuna basılı tutarak konuş.

> Aynı bilgisayarda iki sekmeyle denemek için "Bağlantı: **Yerel test**" seçeneğini kullan.

---

## 💻 Yerelde çalıştırma (geliştirme)

```bash
npm install          # yalnızca araçlar için (varlık paketleyici); oyunun kendisi bağımlılık gerektirmez
npm start            # http://localhost:8080
```

`npm start` yerine herhangi bir statik sunucu da olur (ör. `python3 -m http.server 8080`). Dosyayı
doğrudan `file://` ile açma: tarayıcılar ES modüllerini ve model dosyalarını o şekilde yüklemez.

### Testler

```bash
npm test             # birim testleri (envanter, ihtiyaçlar, zaman, harita sisi, hava, görev kancaları, kayıt)
npm run test:e2e     # uçtan uca senaryolar (başsız Chromium + Playwright; önce `npm start`)
```

Ayrıntılar: [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md).

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

**Temel döngü:** Gündüz keşfe çık ve yağmala → akşam üsse dön, pencereleri tahtayla güçlendir, barikat
kur → gece uyuyarak zamanı hızlandır (takımın yarısı yatmalı) → takvim olaylarına, rastgele olaylara ve
sürülere hazırlan → 30. gün 22:00'ye kadar bir kaçış yolu hazırla.

**Finaller (Görevler → Kaçış Planları):** Yeraltı sığınağı · Askerî helikopter (30. gün 20:00) ·
Martı teknesi · Dağ kampı · Köprüden araç konvoyu (30. gün 21:00) · Son savunma. Sonuç ekranında
hayatta kalanlar, üs seviyesi, kararlarınız ve S–D derecesi gösterilir.

---

## 📁 Klasör yapısı

```
index.html                 giriş sayfası (import map, yükleme ekranı)
src/
  main.js, Game.js         önyükleme, ana döngü, menü sahnesi (gün batımında üs)
  Session.js               oturum: host-otoriter eylem/olay hattı, ihtiyaçlar, uyku, kayıt
  core/                    grafik (Three.js + son işlem), giriş, ayarlar, varlık yükleyici, yardımcılar
  world/                   ada arazisi, yollar, köprü, girilebilir binalar + iç mekân, bitki örtüsü, su, gökyüzü,
                           çarpışma dünyası, yol bulma ızgarası (A*)
  entities/                karakter üretimi (doku boyama + aksesuar), prosedürel animasyon, oyuncu, zombi görünümü
  systems/                 envanter, ihtiyaçlar, zaman, ortam/hava, yağma, üretim, inşa, zombiler, savaş, araçlar,
                           NPC/hayvanlar, görevler, olaylar, finaller, harita, YZ takım arkadaşları, kayıt, ses
  net/                     oda/lobi, taşıyıcılar (PeerJS + BroadcastChannel), sesli sohbet
  ui/                      arayüz yöneticisi, menüler, HUD, günlük (envanter/üretim/karakter/görevler/harita), paneller
  data/                    eşyalar, tarifler, yapılar, yağma tabloları, zombiler, hikâye (takvim, olaylar, görevler)
assets/                    CC0 modeller (GLB kitleri), sesler, yazı tipleri, konsept görselleri
vendor/                    three.js r187 (MIT), PeerJS 1.5.5 (MIT)
tests/unit, tests/e2e      birim + uçtan uca testler
tools/                     yerel sunucu, varlık paketleyici, senaryo koşucu, ekran görüntüsü aracı
docs/                      mimari, test raporu, bilinen sorunlar, yol haritası
```

Mimari ayrıntıları: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Bilinen sorunlar:
[`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) · Sonraki aşamalar: [`docs/ROADMAP.md`](docs/ROADMAP.md) ·
Krediler ve lisanslar: [`CREDITS.md`](CREDITS.md)
