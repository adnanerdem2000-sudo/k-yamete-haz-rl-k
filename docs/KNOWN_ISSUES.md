# Bilinen Sorunlar ve Sınırlamalar ("Next Level 2.0" turu ve 1 Kasım 2026 özellik turu sonu)

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
  zombiler korunur ama canları dolar. Göç yalnız oyun sırasında ('playing') yapılır; lobide host düşerse oda kapanır.
  Host oyundan **bilerek** ayrılırsa ("Ana Menüye Dön") göç yapılmaz, oyun herkes için kapanır. Test edilen:
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
- Şehir merkezinde kare başına (gölge haritası ve son işlem geçişleri dahil) Düşük'te ~460, Orta'da (varsayılan) ~770,
  Ultra'da ~1.140 çizim çağrısı; Orta'da ~3,6 milyon üçgen. Zayıf dizüstü GPU'larda **Ayarlar → Grafik → Kalite:
  Düşük** ve **Otomatik çözünürlük** önerilir (otomatik çözünürlük varsayılan olarak açıktır).
- Kalite seviyesinin gölge haritası çözünürlüğü, kenar yumuşatma ve zombi sınırı kısmı tam etki için sayfanın
  yenilenmesini ister (gölge, parlama, çimen, AO, su yansıması, görüş mesafesi, çözünürlük ölçeği anında değişir).
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

## Grafik kalitesi ve performans ölçümü (Aşama 8)
- **Gerçek ekran kartında ölçüm yapılamadı.** Geliştirme ortamında yalnız yazılım GPU'su (SwiftShader) var; oradaki
  kare hızları gerçek donanımı temsil etmez ve öyle sunulmaz. 1080p/60 FPS hedefi doğrulanmadı. Gerçek donanım raporu
  için oyuncu **Duraklat → Ayarlar → Grafik → Performans testini başlat** ile dört sahneyi ölçer, sonucu JSON olarak
  kopyalar. Yazılım GPU'su algılanırsa sonuç tablosunda uyarı çıkar.
- **Ultra pahalıdır:** AO (GTAO) ve gerçek su yansıması sahneyi bir kez daha çizer; ölçümde çizim çağrısı Yüksek'in
  1,4–1,6 katı, göl yakınında ~6 katı. Orta sınıf ekran kartında Yüksek önerilir.
- AO ekran uzayında hesaplanır: ekran kenarında ve ince nesnelerin çevresinde hafif hale görülebilir; saydam ve alfa
  kesimli yüzeyler (yapraklar, cam, su, parçacıklar) AO almaz ve vermez. Oyuncu bir binanın içindeyken (çatı kesit
  görünümü) çevredeki çatılar da AO hesabından çıkarılır.
- Su yansıması yalnız kameraya en yakın su yüzeyinde (göl ya da deniz kıyısı) ve üçte bir çözünürlükte çizilir;
  diğer su yüzeyleri gökyüzü ortam haritasını yansıtır.
- GPU kare süresi yalnız `EXT_disjoint_timer_query_webgl2` uzantısı olan tarayıcılarda ölçülür (çoğu masaüstü
  Chrome/Edge); Firefox ve Safari'de sütun "—" görünür. Uzantı kesinti (disjoint) bildirirse o kare ölçülmez.
- Performans testi yalnız tek oyunculu oyunda ve araç dışında çalışır. Test boyunca oyuncu ve yapay zekâ arkadaşlar
  hasar almaz, otomatik kayıt sona ertelenir, dinamik çözünürlük dondurulur; sürü sahnesinin zombileri sonunda
  kaldırılır ve oyuncu eski yerine döner. Duraklatılırsa ölçüm devam edince baştan alınır.
- Görsel regresyon tabanları (`tests/visual/baseline/`) yazılım GPU'suna özgüdür; başka bir GPU'da
  `VISUAL_BASELINE=1 node tools/e2e.mjs visual` ile yeniden taban alınmalıdır.
- Hasarlı araçların göçük geometrisinde yeniden hesaplanan normallerin bir kısmı sıfır uzunlukta kalıyor ve belirli
  açılardan bakınca bütün ekranı karartıyordu; artık onarılıyor (yüklenen modeller de taranıyor). Parlama geçişi ayrıca
  NaN/sonsuz pikselleri süzüyor: ileride benzer bir bozuk geometri gelirse ekran kararmaz, yalnız birkaç piksel koyu
  görünebilir.

## Binalar, dolaplar, araçlar, gündüz/gece, yer altı sığınakları (1 Kasım 2026 turu)
- **Kuleler:** şehir silüetindeki 11 MegaKit kulesinin yalnız zemin katı girilebilir; üst katlar dış kabuktur (merdiven
  yok). Vitrinler içeriden tahtayla kapatılmıştır ve kırılamaz.
- **Dolap kapakları görseldir:** kanat/kapak/çekmece ön yüzleri çarpışma almaz (açık kapağın içinden geçilebilir);
  yalnız menteşeli oda kapıları ve fizikli çekmeceler fizik nesnesidir. Kapaklar oyuncuya ≈56 m içinde çizilir (en
  yakınlar öncelikli); daha uzaktan bir pencereden bakılırsa buzdolabı kapaksız görünebilir.
- **Araçlar:** yanmış terk edilmiş arabalar hâlâ dekordur (binilemez). Terk edilmiş arabaların yakıtı ve arızası
  konumlarına bağlı tohumla belirlenir (her yeni oyunda aynı). Sürücüsüz araçları yalnız host simüle eder; konumları
  istemcilere 0,1 sn'de bir (değişenler) ve 3 sn'de bir (hepsi) gönderilir. Park etmiş arabayı yalnız host'taki fizik
  kıpırdatır (host'un oyuncusu ya da sürdüğü araç, patlama, sarsıntı): istemcide park etmiş araç kinematik (itilemez)
  bir gövdedir, host'ta da uzak oyuncuların fizik gövdesi yoktur; istemci park etmiş arabayı yürüyerek itemez, kendi
  aracıyla çarptığında araba duvar gibi davranır (pratikte kıpırdamaz).
- **Araç vekilleri:** zombi/bot/NPC çarpışması, mermi, görüş ve ses örtmesi için her kara aracı 3–4 daireyle temsil
  edilir (yarıçap yarı genişlik, merkezler arası en fazla bir yarıçap: ortada yarık yok); köşelerin ve tampon
  uçlarının dış kenarı dairelerin dışında kalır (ölçülen en kötü: binek araçta ~0,45 m, askerî kamyon ve zırhlı
  minibüste ~0,6 m), ama aracı enine kesen her çizgi bir daireye çarpar. İçinde biri varken mermi ve görüşü kesmez. Park etmiş (boş) araç yol ızgarasında engeldir:
  zombi ve botlar onu dolanarak yol planlar, zombi araç içinde doğmaz; sürülen ya da içinde biri olan araç ızgarada
  yer almaz (değen zombi/bot çarpışmayla dışarı itilir). Vekil daireler aracın tam yüksekliğindedir: park etmiş
  arabanın kaputunun üstünden de ateş edilemez (araç siper olarak tam duvar sayılır). Mermi kameradan çıkar, ama
  kamera ile oyuncu arasındaki araç ve ağaçlar atışı kesmez.
- **Bot koltukları (eski sorun, düzeltilmedi):** araçta yere düşen botun koltuğu dolu kalır (kalkana ya da lider
  araçtan inene kadar); botların koltuk değişikliği ağla eşitlenmez, sonradan katılan ya da göçte host olan istemcide
  bot koltuğu kalıcı dolu kalabilir. Koltuğu dolu görünen araç o sürede yol ızgarasına girmez, mermi ve görüşü kesmez,
  o koltuğa binilemez.
- **Kapı pervazları** yol ızgarasında pay almaz (yoksa 1 m'lik kapılar ızgarada tamamen kapanıyordu): zombiler kapalı
  kapıyı zorlayarak, botlar yalnız açık kapıdan binaya yol bulur (botlar kapı açmaz) ve pervaza sürtünerek geçer, kapı
  kenarında kısa takılma görülebilir. NPC'ler yol ızgarası kullanmaz, hedefe düz yürür.
- **Gündüz/gece:** doğal zombiler yalnız 20.30–06.00 arasında doğar (final sırasında ve çılgınlık olayında saatten
  bağımsız). Hikâye olaylarının gündüz istediği zombiler o gece 20.35'te aynı yerde topraktan çıkar, sürüler
  20.55'te gelir. Yağmacı devriyeleri
  ve başıboş köpekler yalnız oda sahibinde üretilir (istemciler anlık görüntüyle görür); oyuncu üssündeyken ya da bir
  sığınaktayken başlamaz, dışarıda yağmalarken çıkar. Şafakta toprağa dönmesi
  ertelenen (savaştaki) zombiler en geç 90 sn sonra döner. Geceye ertelenen olay zombileri kovalama hedefini taşımaz:
  topraktan hedefsiz çıkar, oyuncuyu algılayınca kovalar.
- **Uyku:** gece açıkta uyunursa zaman ×8 akar (sığınakta ya da savunması ≥ 20 üste ×40); 20.30'dan önce uyuyanlar
  için hız alacakaranlıkta yeniden hesaplanır. Hasar uyandırır ve uyku oyunu geri çeker; uyku oyu çoğunluk ister.
- **Sığınaklara iniş/çıkış kararmalı ışınlamadır** (merdivenden inme animasyonu yok). Sığınak odaları prosedürel
  beton/kaya kutularıdır (model değil); mağara ve maden odalarında düzensiz kaya yüzü ve ahşap destekler var.
- **Zombiler sığınaklara hiç inmez** ve yüzeydeki zombi yer altındaki oyuncuyu ne görür ne duyar; yer altındaki
  silah sesi yine de yüzeyde gürültü olarak yayılır (zombiler sesin çıktığı noktanın üstünde, yüzeyde toplanabilir).
- **YZ arkadaşlar** yalnız "Takip et" emrindeyken oda sahibinin peşinden sığınağa iner ve çıkar (eskort edilen NPC'ler de
  liderleriyle iner); sığınak içinde yol bulma yüzey ızgarasını kullandığı için uzak odalara giderken duvara
  takılabilirler (yakın takipte sorun yok).
- Sığınağa araçla girilemez ve sığınaklara yapı kurulamaz (yol ızgarası yalnız yüzeyi kapsar). Her sığınakta eşya
  bırakılabilen konteynerler var; hazır yatak yalnız Şehir Halk Sığınağı, Askerî Komuta Sığınağı, Orman Mağarası ve
  Fener Mahzeni'nde var, Hastane Bodrumu ve Morg, Çiftlik Fırtına Mahzeni, Eski Maden Galerisi ve Laboratuvar B1
  Katı'nda uyumak için uyku tulumu gerekir (sığınaktaki hızlı gece uykusu tulumla da geçerli). Kat ayrımı (`Session.levelOf` ya da yükseklik farkı) alan hasarına, hayvanlara, botların
  hedeflerine, ateş/yapı ışıklarına, tuzak ve alarma uygulanır; yer altındaki silah sesi yine yüzeyde duyulur
  (bilinçli).
- **Sürüm uyumu:** ağ protokolü 6'ya çıktı; eski sürümle açık kalmış bir sekme yeni host'a katılamaz ("Oyun sürümleri
  farklı" uyarısı) — sayfa yenilenmeli. Eski kayıtlar yüklenir: eski "araç bagajı" konteynerlerinin durumu aynı yerdeki
  terk edilmiş arabanın bagajına taşınır.
- Deniz seviyesinin altına inen sığınaklarda deniz/göl yüzeyleri yer altındayken gizlenir; yüzeye çıkınca yeniden
  görünür.
- **Bitki yerleşimi kısmen değişti:** ağaç/çalı/çimen dağılımı tek bir rastgele sayı dizisiyle üretildiği için orman
  sığınağının girişinin yerindeki ağaç düşünce, tarama sırasında ondan sonra gelen orman ağaçları ve haritadaki çimenlerin
  yaklaşık yarısı Aşama 8'e göre başka yerde çıkıyor (yeni camide de çevresi değişti). Ölçüm: 3.434 ağacın %87,4'ü ve
  çimenlerin %52,9'u aynı yerde; görsel testteki orman sahnesinin çevresindeki 120 ağacın yalnız 45'i aynı yerde
  kaldığı için o görüntü farklı, taban yenilendi. Oynanışa ve kayıtlara etkisi yok (ağaç durumu kaydedilmez); ileride
  orman/açık araziye eklenecek her çarpıştırıcı dağılımı yine kaydırır (hücre başına bağımsız dizi düşünülebilir).

## Teslimden sonraki denetimin bulduğu hatalar (düzeltilmeyenler)
Bu turda düzeltilenler (`42085cf`): direksiyon simidi sürücü tarafında ve kollu, dönüşü görünüyor; patinaj (kayma)
sesi çalıyor; göçük boyalı gövde kabuğuna araç çerçevesinde uygulanıyor; bozuk farın ışığı sönüyor. Göçük ve bozuk far
`vehicles3` ile denetleniyor; direksiyon ve patinaj sesi otomatik testte denetlenmiyor.
Ayrıntı ve kanıt: `docs/DENETIM_NL2.md`.
- Kayıttan yüklemede ve sonradan katılımda kapı durumu fiziğe uygulanmıyor: açık kaydedilen kapı fizikte kapalı kalabilir
  ve oyuncu yaklaşınca herkes için kapanabilir; kırık kapının kanadı menteşede kalabilir.
- Patlamalar her nesneye kütlesinden bağımsız aynı hızı veriyor (ağır nesne hafif gibi savruluyor).
- Bazı kadın karakter kafalarında gözler saç rengine yakın boyanıyor; Punk ve SciFi kafalarında çene/boyun açık gri.
- Host göçünden sonra gün kilitli görevler (ör. laboratuvar görevi) başlamayabilir; botların çantası ve silahları
  varsayılana döner.
- Kişilik kıpırdanması için iki ayrı zamanlayıcı ve zemin türü için iki ayrı sınıflayıcı var (biri kaldırılmalı).
- 32 uçtan uca senaryonun 15'i yalnız çökme/zaman aşımıyla başarısız olabilir (değer denetimi yok; bu turda eklenen
  beş senaryonun hepsinde ve `multiplayer-local`'de denetim var).

