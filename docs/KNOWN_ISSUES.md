# Bilinen Sorunlar ve Sınırlamalar (v0.1 — web prototipi)

## Çok oyunculu
- **Oda listesi:** Herkese açık PeerJS sinyal sunucusu oda listelemeyi desteklemediği için "Açık Odalar"
  yalnızca *aynı tarayıcıdaki* yerel odaları ve daha önce girilen odaları gösterir. Çevrimiçi katılım
  oda kodu ya da davet bağlantısıyla yapılır.
- **NAT/güvenlik duvarı:** WebRTC bağlantısı varsayılan olarak yalnızca STUN kullanır; bazı kurumsal/mobil
  ağlarda TURN sunucusu olmadan bağlantı kurulamayabilir. Kendi TURN sunucun varsa **Ayarlar → Oyun → TURN
  sunucuları** alanına JSON olarak gir (ya da `?ice=` parametresi / `window.KIYAMET_ICE`); kimlik bilgisi koda
  yazılmaz, yalnız bu tarayıcıda saklanır. Gerçek TURN ile bağlantı bu ortamda test edilemedi.
- **Host göçü (sınırlı):** Oda sahibi düşerse istemciler önce yeniden bağlanmayı dener; host gerçekten yoksa
  (kapanış iletisi + 5 sn ya da 90 sn sessizlik, iki başarısız deneme) oda sırasındaki ilk çevrimiçi istemci aynı
  oda koduyla yeni host olur; diğerleri ona bağlanır. Dünya/zombi/bot/kapı/eşya durumu son anlık görüntüden ve
  8 sn'de bir yayımlanan oyuncu kayıt paketinden devralınır; aradaki en fazla 8 sn'lik envanter değişikliği
  kaybolabilir. Yeni host'un görüş alanı dışındaki (150 m ötesi) zombiler bölge kuralıyla yeniden oluşur; görülen
  zombiler korunur ama canları dolar. Göç yalnız oyun sırasında ('playing') yapılır; lobide host düşerse oda kapanır. Test edilen:
  iki sekme + göçten sonra katılan (`host-migration`) ve üç eşzamanlı sekme, ikinci istemcinin yeni host'a
  kendiliğinden bağlanması (`host-migration3`). Dörtten fazla gerçek sekmeyle göç denenmedi.
- **Çevrimiçi (PeerJS) taşıyıcı** bu geliştirme ortamında internet kısıtı nedeniyle uçtan uca test
  edilemedi; aynı protokol yerel taşıyıcıyla (iki/üç sekme, 6 oyunculu ortam) test edildi. Sorun olursa "Yerel test" ile
  karşılaştırarak bildirmen yeterli.
- Takas dükkânında satın alma oda sahibi üzerinden gider (stok herkeste aynı); satış (oyuncunun tüccara eşya
  vermesi) stoğu değiştirmez. Stok günlüktür ve kayda yazılmaz (oyun yeniden yüklenince o günün stoğu yenilenir).
- Sesli sohbet yakınlık sesidir (Web Audio PannerNode, 35 m'den uzakta duyulmaz); iki tarafta da **telsiz**
  varsa mesafesiz duyulur. Başsız test ortamında mikrofon/hoparlör olmadığı için 3B konumlandırma yalnız kod
  incelemesiyle doğrulandı. Yalnız PeerJS taşıyıcısında çalışır (yerel iki sekmede ses yok).
- Fiziksel nesneler (variller, pist enkazları, paraşütlü paket) her istemcide yerel simüle edilir; taşınan nesne
  ve son konumlar host'tan eşitlenir (sonradan katılan/yeni host dinamik nesnelerin konumlarını hoş geldin
  paketinden alır); ara konumlar istemciler arasında farklı görünebilir.
- Vahşi hayvanların yapay zekâsı oda sahibinde çalışır; istemciler saniyede 5 anlık görüntüyle kopya gösterir
  (170 m içindekiler). Bağlantı kötüyse hayvanlar istemcide kısa süre takılabilir; hareket tahmini 0,4 sn ile sınırlı.
- Altı oyunculu test ortamında dört oyuncu protokol düzeyinde sahte eştir (hafif sayfa); altı tam oyun sekmesi
  yazılım GPU'lu ortamda çok yavaş olduğu için çalıştırılmadı.

## Oynanış
- Yapay zekâ takım arkadaşları: takip, savaş, kaldırma, kendini besleme, yağma (`loot`) ve yarım kalan yapıyı
  tamamlama (`build`) emirleri. Araç sürmez (yolcu biner), kendi başına savunma inşa etmez.
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
- Karakter kıyafetlerinde kumaş dokusu/normal haritası yoktur (modüler taban UV'siz; renk ve pürüzlülük köşe
  başınadır). 103 kafa×gövde kombinasyonunda geometrik boşluk ölçülmedi (`tools/dev/outfit-combos.mjs`).
- Menteşeli kapı ve çekmece açıları her istemcide yerel simüle edilir; E ile aç/kapat ve iterek açma durumu
  eşitlenir, ara açılar istemciler arasında küçük farklar gösterebilir.
- İç mekân duvar resimleri ve halılar mobilyadan bağımsız yerleştirilir; nadiren bir dolabın arkasına denk
  gelebilir. Perdeler yalnız ev/otel/ofis tipi odalarda.
- Şehir kitinden gelen büyük binaların (Downtown City MegaKit `Building_Large_*`) zemin katında modelin kendi
  "sahte aydınlık iç mekân" dokulu vitrinleri uzaktan parlak kırmızı bir bant gibi okunur (kit tasarımı).
- Yazılım GPU'lu test ortamında oyun içi kare süresi saniyelere çıkabilir (gölgelendirme CPU'da); fizik ve
  oyun mantığı sabit adımlı olduğu için senaryolar fizik adımı sayarak bekler. Gerçek GPU'da bu görülmez.
- Araç kapı/bagaj kanatları gövde ağından ayrı değildir: kanat açılınca gövde yüzeyi altında kalır (Kenney
  modellerinde kapı parçası yok); kabin tüm araçlarda aynı prosedürel koltuk/gösterge setidir.
- Eşya simgeleri ilk görüldüklerinde bir kare sonra belirir (karede en fazla bir simge GPU'da çizilir); o ana dek
  yuva saydam görünür.
