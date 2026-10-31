# Bilinen Sorunlar ve Sınırlamalar (v0.1 — web prototipi)

## Çok oyunculu
- **Oda listesi:** Herkese açık PeerJS sinyal sunucusu oda listelemeyi desteklemediği için "Açık Odalar"
  yalnızca *aynı tarayıcıdaki* yerel odaları ve daha önce girilen odaları gösterir. Çevrimiçi katılım
  oda kodu ya da davet bağlantısıyla yapılır.
- **NAT/güvenlik duvarı:** WebRTC bağlantısı yalnızca STUN kullanır; bazı kurumsal/mobil ağlarda TURN
  sunucusu olmadan bağlantı kurulamayabilir. (Çözüm: ROADMAP'teki kendi sinyal/TURN sunucusu.)
- **Host göçü yok:** Oda sahibi oyundan çıkarsa oda kapanır. Otomatik kayıt her gün host'ta alınır;
  oda sahibi kaydı yükleyip odayı yeniden kurabilir, arkadaşlar aynı tarayıcıyla katılınca eşyaları iade edilir.
- **Çevrimiçi (PeerJS) taşıyıcı** bu geliştirme ortamında internet kısıtı nedeniyle uçtan uca test
  edilemedi; aynı protokol yerel taşıyıcıyla (iki sekme) test edildi. Sorun olursa "Yerel test" ile
  karşılaştırarak bildirmen yeterli.
- Takas dükkânının stok bilgisi her oyuncunun kendi tarayıcısında tutulur (stoklar oyuncular arasında
  eşitlenmez).
- Sesli sohbet yakınlık (3B) sesi değil, takım telsizi gibi her yerden duyulur.
- Fiziksel nesneler (variller, pist enkazları, paraşütlü paket) her istemcide yerel simüle edilir; pist
  enkazının son konumu hareket ettiren oyuncudan eşitlenir, ara konumlar istemciler arasında farklı görünebilir.
- Vahşi hayvanlar (olaylardaki kurt sürüsü ve geyikler dahil) yalnızca oda sahibinde simüle edilir.

## Oynanış
- Yapay zekâ takım arkadaşları basit davranışlara sahiptir (takip, savaş, kaldırma, kendini besleme);
  yağma yapmaz ve inşa etmez. Emirler: Takip et / Burada bekle / Üsse dön.
- Yerleştirilen yapılar köprü/su üzerine kurulamaz; bazı karmaşık arazilerde "Engel var" uyarısı
  beklenenden sık çıkabilir (yeri biraz değiştir).
- Zombiler engelleri kırarken yol bulma bütçesi sınırlıdır; çok kalabalık sürülerde bazı zombiler
  bir süre takılı kalabilir.
- "Kapılı Duvar" yapısının açılır kanadı basit bir model kullanır.
- Mobil/dokunmatik kontrol desteği yoktur (masaüstü klavye + fare hedeflendi).
- Uçak kalkışı ve düşen uçak sahneleri kendi kamerasını kullanmaz; oyuncu kamerası sahneyi uzaktan izler.

## Görsel / performans
- Şehir merkezinde kare başına ~400 çizim çağrısı (varsayılan ayarlar, gölgeler açık; önceki sürümde ~1.100), 2,5–3 milyon üçgen çizilir. Zayıf
  dizüstü GPU'larda **Ayarlar → Grafik → Kalite: Orta/Düşük** ve **Otomatik çözünürlük** önerilir
  (otomatik çözünürlük varsayılan olarak açıktır).
- Kalite (gölge haritası çözünürlüğü, kenar yumuşatma) değişikliği tam etki için sayfanın yenilenmesini ister.
- Tarayıcı Esc tuşunu işaretçi kilidinden çıkmak için yutar; Esc'ye basınca duraklatma menüsü açılır
  (oyuna dönmek için ekrana tıkla).
- Bazı nadir karakter giysi kombinasyonlarında doku dikişleri görülebilir.
