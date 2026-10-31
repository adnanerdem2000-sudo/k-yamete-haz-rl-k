# Yol Haritası — Sonraki Aşamalar

## Aşama 1: Oynanabilir web prototipi ✅
Tüm ana sistemler, 6 karakter, açık dünya ada, 30 günlük takvim, 20 rastgele olay, 6 final,
2–6 oyunculu co-op (P2P), yapay zekâ takım arkadaşları, kayıt/yükleme, tüm arayüz ekranları.

## Aşama 1.5 (bu sürüm): Derinleştirme ✅
Rapier 3D fizik motoru, iskeletli karakter ve hayvan modelleri, yeni zombi türleri, 2 km'lik genişletilmiş
ada (8 yeni bölge), 45 olay, 14 NPC, 29 görev, 7 final (uçak), zaman çizelgesi ekranı, epilog,
hikâye dünyası (halatla çekilen pist enkazları, fener ve gemi, elektrik şebekesi, paraşütlü paket,
düşen uçak, sarsıntı, Kanlı Ay), HRTF/oklüzyon/yankı ile 3B ses, zemine göre ayak sesleri.

## Aşama 2: Masaüstü `.exe` sürümü
Oyun derleme gerektirmeyen statik bir web uygulaması olduğu için doğrudan paketlenebilir:

1. **Electron** (önerilen, en hızlı yol):
   ```bash
   npm i -D electron electron-builder
   ```
   - `electron/main.cjs`: `BrowserWindow` açıp `index.html`'i yükler (tam ekran, menü çubuğu gizli,
     `webPreferences.backgroundThrottling = false`).
   - `package.json` → `"build": { "appId": "com.kiyamettenonce.game", "win": { "target": "nsis", "icon": "assets/img/icon.ico" } }`
   - `npx electron-builder --win` → `dist/KIYAMETTEN ÖNCE Setup.exe`
   - Kayıtlar `localStorage` yerine `app.getPath('userData')` altındaki JSON dosyalarına taşınabilir
     (SaveSystem arayüzü buna hazır: `write/read/list`).
2. **Tauri** (daha küçük kurulum, ~10 MB): aynı `index.html`; WebView2 gerektirir.
3. **Steamworks** (ileride): Electron + `steamworks.js` ile başarımlar, arkadaş daveti, Steam Datagram Relay
   ile NAT sorunsuz çok oyunculu.

## Aşama 3: Çok oyunculu altyapı
- Kendi PeerJS sinyal sunucusu + TURN (coturn) → kurumsal ağlarda da bağlantı, herkese açık oda listesi.
- Host göçü (host düşerse en düşük gecikmeli oyuncu devralır) ve sunucu tarafı kalıcı dünyalar.
- Bağımsız (dedicated) sunucu: `Session` host mantığı Node.js'te başsız çalışacak şekilde ayrılabilir
  (çizim kodu `Avatar/ZombieView` sınıflarında izole).
- Yakınlık tabanlı 3B sesli sohbet ve telsiz eşyası ile kanal seçimi.

## Aşama 4: İçerik ve cila
- Elle modellenmiş kahraman karakterler (konsept görsellere birebir), yüz ifadeleri.
- Hikâye sahneleri için ara sinematikler (uçak kalkışında kokpit kamerası, fener yanarken yakın plan).
- Daha fazla bina içi, yer altı otoparkı, metro tüneli, laboratuvarın gizli katı.
- Yeni zombi davranışları (tırmanan, çığlık atan), patron savaşı (sürü lideri evrimi).
- Gelişmiş YZ arkadaşlar: yağma görevleri, inşa yardımı, nöbet vardiyası.
- Dinamik müzik için kaydedilmiş enstrüman katmanları, seslendirme.
- Mobil/gamepad kontrolleri, erişilebilirlik (renk körlüğü modu, altyazı boyutu).
- Başarımlar, istatistik geçmişi, zorluk ayarlı "Kıyamet+" modu, kalıcı ölüm seçeneği.
