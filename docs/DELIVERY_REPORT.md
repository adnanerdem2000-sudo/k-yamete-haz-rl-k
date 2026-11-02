# Teslim Raporu — "Next Level 2.0" turu

Sekiz aşama 1 Kasım 2026'da uygulandı ve teslim edildi, ama **istemin bütün ayrıntılı maddeleri karşılanmadı.**
Teslimden sonra yapılan bağımsız eksiksizlik denetimi (§10, `docs/DENETIM_NL2.md`): istemdeki 253 somut talebin 101'i
tam, 126'sı kısmi, 26'sı yapılmadı; kısmi/yok olanların 100'ü bu raporda önceden yazmıyordu ve denetim kodda düzeltilmemiş
hatalar da buldu. Kabul kriterlerinin durumları (§7) bu denetime göre düzeltildi. Test edilemeyen sistemler §6'da,
son test sonuçları §8'de, kalan sorunlar §9–10'da ve `KNOWN_ISSUES.md`'de. Sonraki özellik turu (her binaya giriş,
açılan dolaplar, kullanılabilir araçlar, gündüz yağma / gece zombi, yer altı sığınakları), bağımsız incelemesi ve son
tam test koşusu §11'de.

İstemin 18. bölümündeki başlıklar: başlangıç mimarisi §1 · tespit edilen / düzeltilen sorunlar §2–3 · değiştirilen
dosyalar ve eklenen sistemler §4 · karakterler ve animasyonlar §5 Aşama 2 · fizik Aşama 3 · harita ve çevre Aşama 4 ·
araçlar Aşama 5 · zombi ve bot YZ Aşama 6 · çok oyunculu Aşama 7 · performans ölçümleri Aşama 8 ve §8 · birim ve
uçtan uca test sonuçları §8 · gerçek donanım testleri §6 (yapılamadı) · bilinen kalan sorunlar §9.

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
- **Host göçünde çatallanma (split-brain)**: istemci, host'un yavaş kare/yükleme takılmasını (yerel taşıyıcı
  kalp atışı gecikmesi) "host düştü" sanıp yeni host oluyor; iki dünya birden sürüyordu. Aşama 7'de bulundu.
- **Aynı jetonla yeniden katılım**: kopan oyuncu geri gelince eski eş kaydı silinmeden ikinci kayıt açılıyordu
  (çift avatar). Aşama 7.
- **`Net.leave()` erken dönüşü**: yeniden bağlanırken çağrılan `leave` taşıyıcıyı kapatmıyordu. Aşama 7.
- **Ölmekte olan host'a yeniden katılma**: host sekmesi kapanırken "kapanıyorum" iletisini yolluyor ama sayfası
  kapanana dek bağlantı kabul etmeye devam ediyordu; hızlı istemcinin ilk yeniden bağlanma denemesi ona ulaşıp yeniden
  katılıyor, host sessizce kaybolunca göç 90 sn'lik "sessizlik" yoluna düşüyor (B'nin host olması 148 sn, envanter ve
  zombi durumu eski kopyadan). İşaretçi kilidi düzeltilip sayfalar hızlanınca ortaya çıktı. Aşama 7.
- **Yeni katılan oyuncunun 45 sn'de düşürülmesi**: göç sonrası katılan istemcinin ilk kareleri (zayıf makinede
  gölgelendirici derlemesi) 45 sn'yi aşınca host onu düşürüyor, istemci ~70 sn sonra kendiliğinden yeniden bağlanıyordu
  (iz sondası `tools/dev/late-join-probe.mjs`). Aşama 7.
- **Göçte zombi durumunun sıfırlanması**: yeni host gördüğü zombileri silip bölgeleri sıfırdan kuruyordu (ölenler geri
  geliyordu). Aşama 7.
- **Araç sürücü değişiminde `onRoad` TDZ hatası** (yüzey bloğu değişkenden önce okunuyordu); Aşama 5 inceleme.
- **Başsız tarayıcıda işaretçi kilidi döngüsü (test ortamı)**: çok oyunculu senaryolarda iki sekme çöküyordu
  (`carry-mp`, `multiplayer-local`, `host-migration`'ın son adımı). Ölçüm: tarayıcı ana süreci oyun sırasında
  dakikada 1–2 GB büyüyor (2,6 → 5,6 GB), render süreçlerinde Oilpan yığını 1,5–2 GB; 13,4 GB'lık süreç grubu
  sınırında OOM. Chrome izi: tarayıcı ana iş parçacığında 6 sn'de 254 bin `PostSynthesizeMouseMove` görevi.
  Neden: oyun işaretçi kilidi aldığında Chromium her fare olayında imleci pencere ortasına taşır; başsız kabukta
  imleç hiç hareket etmediği için `MoveCursorToCenter → OnCursorMovedToRootLocation → PostSynthesizeMouseMove`
  sonsuz döngüye giriyor (saniyede ~40 bin sentetik fare olayı). Tek sekmede de vardı (render süreci 2,4 GB,
  oyun ~2 kat yavaş) ama sınırı aşmıyordu. Gerçek tarayıcıda imleç ortaya gittiği için oluşmaz. Ağ trafiği,
  ses, bellek sızıntısı adayları sırayla elendi (`tools/dev/mp-mem-probe*.mjs`, `mem-infra-probe.mjs`,
  `trace-probe.mjs`). Aşama 7.
- **Hasarlı araçta bütün ekranın kararması**: hasarlı doğan araçların göçük geometrisinde normaller yeniden
  hesaplanınca alanı sıfır üçgenlerin köşeleri sıfır uzunlukta normal alıyordu (kamyonet, minibüs, sedan, SUV,
  ambulans, kamyon gövdeleri). Gölgelendiricide `normalize(0)` NaN verir; o kenardaki birkaç NaN piksel parlama
  (bloom) bulanıklığıyla bütün kareye yayılıyor, kare tamamen kararıyordu. Ultra görsel testinde "araç dışı" sahnesi
  iki koşuda da siyah çıktı; göçükler rastgele olduğu için her kalitede ve her oyunda belirli açılardan olabilirdi.
  Sondalar (`tools/dev/ultra-black-probe2.mjs`, `nan-object-probe.mjs`): bileşik tamponun 2.073.600 kanalının hepsi
  NaN, AO normal tamponunda kare ortasında 18 NaN; AO ve su kapalıyken de siyah, parlama kapalıyken görüntü var;
  ışın o pikselde kamyonetin gövde ağına çarptı, ağda 2 sıfır normal. Aşama 8.
- **AO'da gizli çatı hayaleti**: AO geçişi normal/derinlik tamponunu ortak bir malzemeyle çizdiği için, oyuncunun
  içinde bulunduğu binanın köşe gölgelendiricisinde kırpılan çatısı AO tamponunda kalıyor, iç mekân görünümünde
  gökyüzünde açık renkli bir üçgen bırakıyordu (Ultra, bina içi görüntüsü). Aşama 8.
- **Ayar varsayılanlarının değişmesi**: `Settings` kayıtta olmayan bölümleri `DEFAULTS` nesnesinin kendisiyle
  dolduruyordu; kalite ön ayarı ve tuş değişikliği varsayılanları değiştiriyor, "Tüm ayarları sıfırla" eski değerlere
  dönmüyordu (birim testi eski kodda başarısız). Aşama 8.
- **Performans testi**: oturum kapanınca kapanmış oturumda çalışmaya devam ediyordu; araçtayken de başlıyor,
  oyuncuyu araçtan inmeden ışınlıyordu; duraklatılan süre (yalnız çizim) ölçüme giriyor ve kare süresini olduğundan
  iyi gösteriyordu; botlar sürüde hasar alıyordu; test sırasında gün dönerse otomatik kayıt oyuncuyu sürünün ortasında
  kaydederdi; dinamik çözünürlük ölçüm sırasında değişebiliyordu; sonuçta su yansıması ayarı yanlış anahtarla
  (`water`) yazılıyordu; 600 karelik pencere 75 FPS üstünde 8 sn'lik ölçüme sığmıyordu. Aşama 8 inceleme iş akışı.

## 3. Düzeltilen sorunlar
- `Interact.findTarget`: uzaklık alanı `dist` oldu; `interact` senaryosu kapı adımı bunu yakalar.
- `Buoyancy`: her adımda `resetForces`. `DoorPhysics`: komuttan sonra 2 sn itme sayılmaz.
- `IconRenderer.iconInto` + `flush`: simgeler kuyruğa alınır, `Game.loop` karede en fazla bir simge çizer; `<img>`
  hazır olunca güncellenir. `story` senaryosu render süreci 2,5–3,1 GB'da sabit, 0 hata.
- `Vegetation.update`: parametre değişse de en sık 0,2 sn'de bir kurulum (kamera 50 m sıçramadıkça).
- `interact` / `physics2` senaryoları simülasyon zamanıyla ölçer; `physics2` adım/sn denetimi yazılım GPU'sunda
  bilgi amaçlı.
- `Net.onHostLost`: önce yeniden bağlanma (40 deneme), göç yalnız "kesin kayıp"ta (kapanış iletisi + 5 sn ya da
  90 sn sessizlik, iki başarısız deneme, oyun 'playing' durumunda, sırada ilk çevrimiçi istemci). `LocalTransport`
  kalp atışı takılma koruması (sekme 10 sn donarsa zaman aşımı sıfırlanır), bağlanma zaman aşımı 10 sn.
- `Net.onHello`: aynı jetonla gelen eş eski kaydı düşürür; `leave()` yalnız gerçekten boştayken erken döner;
  sıra sayaçları oturum başında/çıkışta sıfırlanır.
- `sanitizeIce`: yalnız `stun:`/`turn:`/`turns:` şemaları, TURN için kullanıcı adı + kimlik bilgisi zorunlu;
  ayarlar ekranında JSON ve depolama hataları ayrı iletilerle.
- Taşıyıcılar: `beforeunload` sonrası 4 sn yeni bağlantı/yoklama yanıtı yok (kapanış iptal edilirse sonra normal);
  `Net.peerTimeout`: dünyasını kuran ve katıldıktan sonraki ilk 2 dk içindeki eşe 4 dk, diğerlerine 45 sn;
  `Session.becomeHost`: görülen zombiler gerçek zombiye çevrilir, bölge nüfusu/öldürülen sayıları `pdata` ile.
- Test koşucusu (`tools/scenario.mjs`) sayfalara `requestPointerLock`'u reddeden bir başlangıç betiği ekler
  (`PW_POINTERLOCK=1` ile eski davranış). İki sekmede tarayıcı süreci 94 MB'ta, render süreçleri 750–800 MB'ta
  sabit (önce 2,6 → 5,6 GB ve 2,2–3,3 GB); tek sekmede render süreci 2,4 GB → ~0,8 GB.
- `VehicleVisuals.dent` yeniden hesaplanan normalleri onarır (`NormalRepair.repairNormals`: sıfır/NaN normal →
  komşu üçgenin yüz normali), onarımda özgün normaller geri yüklenir; yüklenen modeller de bir kez taranır.
  Parlamanın yüksek geçiş girişi NaN/sonsuz pikselleri süzer (sonda: NaN yayan ağ eklenince kare kararmadı).
  `vehicles2` senaryosu her araç modeline üç göçük açıp normalleri tarar.
- AO geçişi çatı gizliyken birleşik çatı ağlarını çizmez. `Settings` varsayılanları derin kopyalar.
- `Benchmark.run`: oturum kapanır ya da oda açılırsa iptal (kapanmış oturuma dokunmaz; `benchmark` senaryosu iptalden
  sonra yeni oyun başlatıp fiziğin ilerlediğini denetler), araçta/yerde/tırmanırken reddeder, duraklatmada ölçümü
  baştan alır, botları da korur, otomatik kaydı sona erteler, dinamik çözünürlüğü dondurur (`Graphics.holdScale`), ayar
  değişirse sonucu işaretler; `PerfMonitor` penceresi 8192 kare, GPU kesintisinde bekleyen sorgular atılır.
- Su yansımasının "kıyı" kısayolu deniz seviyesinin 6 m üstündeki her düzlüğü (şehir merkezi dahil) kıyı sayıyordu →
  +0,5 m. Gölge aç/kapa yalnız gölge düşüren değil gölge alan (zemin, yol) malzemeleri de yeniden derletir.
- Lastik sesi: uzaktan sürülen araçtaki yolcu için zemin türü güncellenmiyordu (asfaltta çakıl sesi); oturum
  `endSession` dışında kapanınca (yeniden bağlanma, host göçü) lastik/patinaj döngüleri çalmaya devam ediyordu.
- Görsel test: donmuş döngüde ortam ışığı haritası istenen saatin göğüyle yenilenmiyordu (yenileme oyun süresi ve duvar
  saatine bağlı; öğle sahneleri menünün akşam ışığıyla çiziliyordu) → her sahnede yeniden çizilir. Araçlar rastgele
  hasarla doğduğu için araç sahneleri koşudan koşuya değişiyordu → çekimden önce gövde hasarsız duruma alınır. Test
  koşucunun hafif ayarlarıyla (Düşük, %60 çözünürlük, gölge/parlama/çimen kapalı) çalışıyordu → karşılaştırma artık
  oyunun varsayılanı Orta'da. Aşama 8 öncesi taban bu düzeltilmiş testle Aşama 7 koduyla (`95f460b`) yeniden alındı.

## 4. Değiştirilen dosyalar ve eklenen sistemler
Tur başı `bf132f4` ile tur sonu arasında (`git diff --stat bf132f4..HEAD`): oyun kodunda 51 dosya (12 yeni, 39 değişen;
+3.271 / −189 satır), test, araç ve CI tarafında 63 dosya (+3.726 / −8 satır; 14 görsel taban görüntüsü dahil).

**Yeni modüller (eklenen sistemler)**
| Dosya | Sistem | Aşama |
|---|---|---|
| `src/physics/DoorPhysics.js` | Menteşeli kapı kanadı + dönel eklem, itme algılama, kilit/barikat, kırılma | 3 |
| `src/physics/Drawers.js` | Kayar eklemli çekmeceler (aranırken açılır, itilince kapanır) | 3 |
| `src/physics/Buoyancy.js` | Yoğunluğa göre kaldırma kuvveti, su direnci, dalga ve doğrultma | 3 |
| `src/physics/ContactSounds.js` | Temas kuvvetine ve malzemeye göre çarpışma sesleri | 3 |
| `src/world/Facade.js` | Cephe ayrıntıları: subasman, korniş, köşe taşı, oluk, panjur, tente, yangın merdiveni | 4 |
| `src/world/InteriorDress.js` | İç mekân dekoru, bina durumları (yaşanır/yağmalanmış/barikatlı), pencere durumları | 4 |
| `src/world/BiomeScatter.js` | Bölge temasına göre bitki/kaya serpiştirme | 4 |
| `src/world/StreetLife.js` | Kuş sürüleri, uçuşan kâğıtlar, asma tabelalar | 4 |
| `src/systems/VehicleVisuals.js` | Araç kabini, kapı/bagaj kanatları, hasar görselleri, far ışıması | 5 |
| `src/core/PerfMonitor.js` | FPS, kare süresi, %1 low, CPU/GPU süresi, çizim, üçgen, bellek, zombi, fizik ölçümü | 8 |
| `src/systems/Benchmark.js` | Oyun içi performans testi (şehir merkezi, orman, üs, zombi sürüsü) | 8 |
| `src/core/NormalRepair.js` | Model yüklemede sıfır/NaN köşe normali onarımı | 8 |

**Değişen başlıca dosyalar**
- Çok oyunculu (Aşama 7): `src/net/Net.js`, `src/net/Transport.js`, `src/net/Voice.js`, `src/Session.js`,
  `src/systems/NPCs.js` — TURN ayarı, ping/kayıp göstergesi, yeniden bağlanma, host göçü, hayvan ve tüccar senkronu,
  eylem ofseti, 3B ses.
- Karakter ve animasyon (Aşama 2, 7): `src/entities/Avatar.js`, `Player.js`, `Animations.js`, `CharacterFactory.js`,
  `ItemModels.js` — yüz, kıyafet koleksiyonları, kişilik hareketleri, etkileşim hizası, eylem ofseti.
- Araçlar (Aşama 5): `src/systems/Vehicles.js`, `src/world/Terrain.js` (`surfaceAt`) — yüzeye göre sürüş, hasar,
  uyuyan şasi ve yedek lastik düzeltmeleri.
- Zombi ve botlar (Aşama 6): `src/systems/Zombies.js`, `Bots.js`, `Combat.js` — ayrışma, yol bulma bütçesi, dikkat
  dağıtma, bot emirleri.
- Grafik ve performans (Aşama 4, 8): `src/core/Graphics.js`, `Settings.js`, `Assets.js`, `src/world/Water.js`,
  `src/systems/Environment.js`, `src/world/Vegetation.js`, `src/systems/Effects.js` — AO, su yansıması, kalite
  seviyeleri, gölge haritası boyutu, bitki bantları, efekt yoğunluğu, parlama NaN koruması.
- Dünya (Aşama 3, 4, 8): `src/world/BuildingGen.js`, `Dressing.js`, `Geo.js`, `LivingWorld.js`, `WorldBuilder.js`,
  `src/physics/PhysicsWorld.js`, `src/systems/PhysProps.js`, `Interact.js` — cephe/iç mekân, kapı ve çekmece
  bağlantısı, etkileşim adayı düzeltmesi, gizli çatının AO'dan çıkarılması.
- Ses (Aşama 3, 8): `src/systems/AudioManager.js` — sentez çarpışma, kapı, barikat ve lastik sesleri.
- Arayüz: `src/ui/MenuScreens.js`, `GameScreens.js`, `HUD.js`, `UIManager.js`, `dom.js`, `style.css` — kalite
  seçimi, performans testi ve sonuç tablosu, ağ göstergesi, TURN ayarı, tüccar stoğu.
- Test ve CI: `.github/workflows/ci.yml` (yeni), `pages.yml`, `package.json` (Playwright), `tools/scenario.mjs`
  (işaretçi kilidi, denetim hataları); 9 yeni uçtan uca senaryo (`interact`, `physics2`, `vehicles2`, `ai2`,
  `multiplayer-6`, `host-migration`, `host-migration3`, `visual`, `benchmark`) ve güncellenen `motion`, `story`;
  3 yeni birim test dosyası (`facade`, `net`, `quality`), 14 görsel regresyon tabanı (`tests/visual/baseline/`),
  geliştirme sondaları (`tools/dev/`).

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
### Aşama 5 — Araçlar
- **Kabin ve kanatlar (`VehicleVisuals`):** her araçta koltuklar, gösterge paneli, direksiyona bağlı dönen simit; camlar
  yarı saydam (araç başına klon); kapı kanatları binince/inince açılıp kapanır (test: açılış 1,05 rad → 2,5 sn'de 0);
  bagaj kapağı depo paneliyle açılır/kapanır (1,15 rad → 0; `vehicle_set {trunkOpen}` ile herkeste); far camı ışıması
  F ile (ışıma 2,2 / spot 35 → 0).
- **Hasar görselleri:** 53 km/sa ile duvara çarpma → sağlık 100 → 33, gövdede 2 göçük, boya koyulaştı (R −0,135),
  çatlak cam; içinden geçme yok (duvara 2,1 m). Ağır hasar (%20): 3 göçük + çatlak cam + bir far bozuk; onarım
  görselleri sıfırlar.
- **Yüzeye göre sürüş:** `Terrain.surfaceAt` + `SURFACES` (asfalt/beton/toprak/çim/kum/kaya/kar): 3 sn tam gazda
  aile arabası asfaltta 19,2 m (45,6 km/sa), çimde 16,8 m (39,8 km/sa); arazi aracı çimde 19,9 m (48 km/sa). Dururken
  zıplama 0, dört teker yerde, sürüşte sıçrama ≤ 1,9 cm, batma 0,7 cm.
- **Araçla yapıya çarpma:** pikap 28 km/sa ile evin dış kapısına → kapı 160 → 93 HP (`vehicle_ram`; üs yapısı ve
  pencere de aynı yoldan).
- **Bulunan hatalar:** (1) düz zeminde 2 sn duran aracın şasisi uyuyor, araç denetleyicisi uyuyan gövdeyi
  sürmüyordu → sürücü girdisinde/binince uyandırılır; (2) SUV'un gövdeye asılı yedek lastiği fizik tekerleği sayılıyordu
  (5 tekerlek) → yedek lastikler dışlandı; (3) başsız tarayıcıda işaretçi kilidi anında düştüğü için duraklatma
  menüsü açılıp sürüş girdilerini engelliyordu (yalnız test ortamı; senaryo kilit olayını susturur); (4) inceleme
  iş akışının bulduğu `onRoad` TDZ hatası uygulanmadan düzeltildi.
- **Yapılmadı:** araç türüne özel kabin modelleri (ortak prosedürel kabin), kapı/bagaj kanatları gövdeden ayrı
  modellenmedi (gövde üstünde ince panel), lastik izi/çamur sıçraması, hasarlı aracın sürüş davranışı (yalnız
  azami hız düşer).
### Aşama 6 — Zombi ve bot YZ
- **Sürü:** yol bulma bütçesi en yakındakilere; 60 m'den uzaktakiler seyrek düşünür. Üst üste binme yok: aynı noktaya
  doğan 12 zombi 3 sn sonra en yakın çift 0,55 m (önce 0,37 m, bir çift iç içeydi); zombi kovalarken oyuncuya
  en yakın 1,57 m (saldırı menzili dışına çıkmadan içine girmez). Arama davranışı (son görülen yer + tahmin + 2–3
  arama noktası) korundu.
- **Dikkat dağıtma:** boş şişe fırlatılabilir; kırılınca cam kırığı + 32 m ses; test: boşta duran zombi 'investigate'
  durumuna geçip sesin yerine gitti (hedefe 5,3 m).
- **Botlar:** `loot` emri — ev oturma odasında 3,7 sn'de ilk konteyneri aradı, 30 sn'de 4 konteyner, çanta 2 → 10
  eşya; `build` emri — yarım tahta çit 8,8 sn'de tamamlandı; `base` nöbeti devriye. Takım ekranında emir ve çanta
  sayısı; emir anlık görüntüyle istemcilere gider.
- **Bulunan hatalar (inceleme iş akışı + test):** bot ödülü 'grant' olayı botlara ulaşmıyordu (eşya yok oluyordu) →
  doğrudan `Bots.receive`; kayıttan dönen/host göçüyle oluşan botta `lootDone` tanımsızdı → kurucu/koruma;
  ulaşılamayan konteynerde takılma → 20 sn'de vazgeçer; önceki testlerin zombileri botları yere düşürüyordu (test
  düzeni: zombi temizliği + diriltme).
- **Yapılmadı:** botların araç sürmesi (yalnız yolcu olarak biner), botların kendi başına üs savunması inşa etmesi
  (yalnız oyuncunun yerleştirdiği yapıyı tamamlar), zombi sürüsü için akış alanı (flow field) — A* bütçesi yeterli
  bulundu.
### Aşama 7 — Çok oyunculu
- **STUN/TURN:** `PeerTransport.iceServers()` varsayılan genel STUN listesine `window.KIYAMET_ICE`, localStorage
  `kiyamet.net.ice` (Ayarlar → Oyun → "TURN sunucuları (JSON)") ya da `?ice=` parametresinden gelen sunucuları
  ekler; `sanitizeIce` yalnız `stun:`/`turn:`/`turns:` şemalarını ve kimlik bilgisi tam TURN girdilerini kabul eder.
  Kimlik bilgisi depoda/kodda yok. Gerçek TURN bağlantısı bu ortamda test edilemedi.
- **Ağ göstergesi:** host eşlere, istemci host'a 2 sn'de bir (duvar saatiyle; yavaş karede oyun zamanı yavaş akar)
  ping atar; gösterilen gecikme son ölçüm ile cevapsız en eski pingin yaşından büyüğüdür (takılan bağlantı hemen
  görünür). Kayıp, durum/anlık görüntü sıra numaralarından. HUD'da ms + kayıp yüzdesi, iyi/orta/kötü renk.
- **Yeniden bağlanma ve host göçü:** kopmada önce aynı koda yeniden bağlanma (40 deneme; aynı jetonla gelen eşin eski
  kaydı düşürülür, sesli çağrı yeniden yanıtlanır). Host "kesin" kayıpsa (kapanış iletisi + 5 sn ya da 90 sn sessizlik,
  iki başarısız deneme, oyun sürüyorsa) oda sırasındaki ilk çevrimiçi istemci aynı oda koduyla host olur; diğerleri
  ona kendiliğinden bağlanır. Yeni host gördüğü zombileri (aynı tür, konum, yön), bot vekillerini ve hayvan
  kopyalarını gerçek simülasyona çevirir, ayrılanların koltuklarını boşaltır; envanterler ve zombi bölge nüfusu /
  öldürülen sayıları 8 sn'de bir yayımlanan `pdata` paketinden geri yüklenir (ölen zombiler geri gelmez; önceden
  yeni host bölgeleri sıfırdan kuruyordu).
  Yerel taşıyıcıda host tarafı takılma koruması ve dünyasını kuran eşe 4 dk zaman aşımı eklendi.
- **Fizik ve dünya senkronu:** taşınan nesne ve dinamik nesnelerin son konumu hoş geldin paketinde (sonradan katılan,
  yeni host); araç koltuğu/kapı/bagaj `veh_set` ile. **Hayvanlar** artık yalnız host'ta değil: host simüle eder
  (algı, saldırı, doğma ve kaybolma bütün oyunculara göre), istemcilere 5/sn anlık görüntü (konum, yön, hız, durum,
  can) gider, istemci enterpolasyon + 0,4 sn tahminle taşır; istemcinin vuruşu host'ta işlenir, saldırının hasarı
  (boğa/ayı itmesiyle) yalnız hedef oyuncuya olay olarak gider, saldırı klibi/sesi herkeste oynar. **Tüccar stoğu**
  host'ta düşer (`trade_buy` eylemi → `trade_stock` olayı), alıcı ödeyemezse satış geri alınır, stok hoş geldin
  paketinde.
- **Animasyon senkronu:** tek seferlik eylemler sayaç + klip kimliği + süreyle gidiyordu; şimdi başlangıç zamanı
  (`actT`: paket gönderilirken eylemin üzerinden geçen süre) da gider; uzak avatar klibi o kadar ileriden başlatır,
  böylece klip aynı paketteki (gecikmeli gösterilen) konumla eş zamanlı kalır; ilk görülen ama hâlâ süren eylem de
  kaldığı yerden oynar. Protokol sürümü 4. (İlk sürüm ağ gecikmesini de ekliyordu; inceleme, hareket kliplerinin
  konumun önüne geçtiğini gösterdi → kaldırıldı.)
- **3B ses:** `Voice.spatialize` her uzak oyuncu için `MediaStreamSource → Gain → PannerNode(HRTF, ters mesafe,
  35 m)`; dinleyici = kamera; iki tarafta telsiz varsa mesafesiz. Yalnız PeerJS taşıyıcısında; başsız ortamda
  mikrofon/hoparlör olmadığından yalnız kod incelemesiyle doğrulandı.
- **6 oyunculu test ortamı (`multiplayer-6`):** A host + B istemci gerçek sekmeler, dört oyuncu protokol düzeyinde
  sahte eş (hafif sayfa, BroadcastChannel). Ölçülen: host ve gerçek istemci 6 oyuncu gördü; sahte eşler
  anlık görüntüde 6 oyuncu aldı (ortalama anlık görüntü ~1,1 KB, 10/sn); 7. oyuncu "Oda dolu." ile reddedildi;
  ayrılan eş aynı jetonla aynı oda kaydına döndü (çift kayıt yok); host'un ölçtüğü gecikme 17–21 ms; sahte eşin
  sohbeti gerçek istemcide göründü. Hayvan: host'ta doğan geyik istemcide aynı konumda (fark 0,00 m), istemcinin
  vuruşu host'ta öldürdü; saldıran yaban domuzunun hasarı (14) istemciye ulaştı. Takas: istemci 10 para ödedi, eşyayı
  aldı, stok host ve istemcide 5 → 4. Eylem ofseti: ilk koşuda uzak avatar ilk gördüğü eylemi oynatmıyordu (eski
  davranış) → düzeltildi.
- **Üç sekmeli göç (`host-migration3`):** A host, B ve C istemci; C yağmalar, B kapı açar; A kapanır → B host olur, C
  kendiliğinden B'ye bağlanır. Son kodla ölçülen: B 25 sn'de host oldu, gördüğü 6 zombinin 6'sı aynı yerlerde korundu
  (bölge durumu `pdata` ile ulaştı), C 41 sn'de (dünyasını yeniden kurarak) bağlandı; C'nin yağmayla değişen
  envanteri ve açılan kapı korundu, boşaltılan konteyner iki tarafta da boş, B'nin oyuncu listesinde C var, B'nin
  zombileri C'de görünüyor, C'nin gecikmesi 11 ms. Üç sekmenin tepe belleği toplam 4,6 GB.
- **İki sekme + geç katılan (`host-migration`):** B host oldu, envanter ve kapı korundu, göçten sonra katılan C
  kapıyı açık görüyor ve B'nin oyuncu listesinde (son iki denetim bu turda eklendi).
- **Son koşu (Aşama 7 kodu, sırayla):** `multiplayer-6` 258 sn, `multiplayer-local` 303 sn, `carry-mp` 284 sn,
  `host-migration` 620 sn, `host-migration3` 843 sn — hepsi 0 hata. Birim testi 41/41.
- **Test ortamı bulgusu:** iki sekmeli senaryoların çökmesi oyunun değil başsız kabuğun işaretçi kilidi döngüsüydü
  (bkz. §2/§3); düzeltmeden sonra iki sekme toplam ~3,3 GB, üç sekme ~3,8 GB.
- **İnceleme:** iş akışı (3 mercek + bulgu başına 3 şüpheci) on aday buldu, hepsi uygulandı: çift tıklamada tüccar
  stoğunun boşa düşmesi (doğrulandı → ödenemeyen satış iadesi + bekleyen istek koruması), gece yarısını geçen açık
  panelde yanlış gün, protokol sürümünün artırılmaması, anlık görüntü kesilince hayvanın sınırsız kayması ve göçte bu
  kaymış konumun benimsenmesi, göçte hayvan canının dolması, saldırı klibi/sesinin yalnız host'ta oynaması; animasyon
  merceği ayrıca ağ gecikmesinin klip ofsetine eklenmesini (hareket klipleri konumun önüne geçiyordu; tek ham RTT
  örneği; host'un kendi kaydına da +50 ms) buldu → gecikme terimi kaldırıldı.
- **Yapılmadı / sınırlar:** lobide host düşerse göç yok (oda kapanır); çevrimiçi (PeerJS/TURN) uçtan uca test yok;
  sesli sohbet 3B konumlandırması dinlenemedi; fizik nesnelerinin ara konumları istemcilerde yerel (son konum/taşıma
  eşitlenir); 6 oyunculu ortamın dört oyuncusu gerçek oyun sekmesi değil protokol düzeyinde sahte eş.
### Aşama 8 — Son kalite
- **Kalite seviyeleri** (Ayarlar → Grafik → Kalite): Düşük / Orta / Yüksek / Ultra. Seçim gölge, parlama, çimen, AO,
  su yansıması, görüş mesafesi (300/420/540/700 m) ve çözünürlük ölçeğini (%85/%100/%100/%100) birlikte, tek
  bildirim ve tek yeniden kurulumla değiştirir; ayrıca gölge haritası 1024/2048/4096/4096, çözünürlük tavanı
  1×/1×/1,5×/2×, bitki tam model mesafesi (ağaç 38/58/85/120 m), zombi sınırı 26/38/50/50, efekt yoğunluğu
  %50/%80/%100/%100. Varsayılan Orta; AO ve su yansıması yalnız Ultra'da açık (istem: "her efekti varsayılan olarak
  açma"). Gölge aç/kapa yalnız gerçekten değişince malzemeleri yeniden derletir.
- **Grafik:** AO (GTAO, saydam/alfa kesimli yüzey, gökyüzü ve gizli çatı hariç), düzlemsel su yansıması (kameraya en
  yakın göl/kıyı, 1/3 çözünürlük, eğik yakın düzlem). Islak yüzey (yağmurda pürüzlülük), iç mekân ışığı ve
  gökyüzünden üretilen ortam ışığı (PMREM) Aşama 4'ten. Parlama girişinde NaN koruması (§2/§3).
- **Performans ölçümü** (`PerfMonitor`): FPS, ortalama kare süresi, %1 low, CPU ve GPU kare süresi, çizim çağrısı ve
  üçgen (karenin bütün geçişleri), bellek (JS yığını, GPU geometri/doku), aktif zombi, fizik gövdesi (uyanık/toplam).
  Oyun içi gösterge ve performans testi kullanır.
- **Performans testi** (Duraklat → Ayarlar → Grafik): şehir merkezi, orman, üs, 40 zombilik sürü; sahne başına ısınma +
  8 sn ölçüm; tablo + JSON. Sağlamlık denetimleri `benchmark` senaryosunda: araçtayken reddedildi, test sırasında
  tetiklenen otomatik kayıt yapılmadı ve sonda bir kez yapıldı, duraklatılan test devam edince tamamlandı, oyun
  kapanınca test iptal edildi ve ardından açılan yeni oyunda fizik ilerledi, sonuç tablosu dört satır + yazılım GPU'su
  uyarısı gösterdi.
- **Ölçümler:** yazılım GPU'sunda (SwiftShader, 576×324) `benchmark` senaryosu, sahne başına 3 sn. Kare hızı
  0,1–17 FPS arasında (gölgelendirme CPU'da) ve **gerçek donanım performansı değildir**; aşağıdaki çizim çağrısı ve üçgen
  sayıları kalite seviyelerinin yükünü gösterir (karenin bütün geçişleri: gölge haritası, AO, yansıma, son işlem).

  | Sahne | Çizim: Düşük / Orta / Yüksek / Ultra | Üçgen (milyon): Düşük / Orta / Yüksek / Ultra |
  |---|---|---|
  | Şehir merkezi | 462 / 771 / 840 / 1.142 | 2,71 / 3,57 / 3,69 / 5,34 |
  | Orman | 240 / 513 / 641 / 3.760 | 1,68 / 2,77 / 3,98 / 25,56 |
  | Üs (ev) | 273 / 531 / 553 / 872 | 1,08 / 1,65 / 1,79 / 3,53 |
  | Zombi sürüsü (40) | 614 / 1.022 / 1.274 / 1.868 | 3,17 / 4,28 / 4,42 / 6,35 |

  Ultra'da çizim çağrısı Yüksek'in 1,4–1,6 katı (AO normal geçişi); göl yakınında ~5,9 katı (yansıma geçişi + AO +
  120 m'ye kadar tam model ağaç). İnceleme düzeltmesinden önce şehir merkezi de "kıyı" sayılıp yansıma çiziliyordu
  (Ultra şehir 1.932 → 1.142 çizim). Fizik: 502–504 gövde, uyanık 5–37. JS yığını ~307 MB.
- **Görsel regresyon:** 14 görüntü, Orta kalite, aynı (düzeltilmiş, belirlenimci) testle Aşama 7 kodu (`95f460b`)
  ile Aşama 8 kodu karşılaştırıldı: 13 görüntüde fark %0–0,07 (eşik %2,5); **araç dışı (08a) Aşama 7 kodunda tamamen
  siyah** (göçük normali NaN hatası, §2), Aşama 8'de doğru. Taban artık Aşama 8 görüntüleri. Ultra
  (`VISUAL_QUALITY=ultra`): AO temas gölgeleri, 4096'lık gölge haritasıyla ağaç gölgeleri, 700 m görüş, göl yansıması;
  gizli çatı hayaleti ve kara kare giderildi. Orta–Ultra karşılaştırma görüntüleri `docs/img/` altında.
- **Ses:** kapı türüne göre açılma sesi (ahşap gıcırtı; metal/hücre/kasa/garaj metalik; cam), barikat kopunca tahta
  çatırtısı (önce çekiç sesi çalıyordu), gevşek zeminde lastik hışırtısı. Malzeme/kütleye göre çarpışma, zemine göre
  ayak sesi, iç mekân yankısı, oklüzyon, savaş teması önceki aşamalardan; `audio` senaryosu (HRTF, zemin, yankı,
  oklüzyon) her koşuda. Hoparlörden dinlenemedi (§6).
- **İnceleme:** dört mercekli çekişmeli inceleme (işleme, performans, ayarlar, ses/görsel test) 21 bulgu
  verdi, 16'sı benzersiz; hepsi uygulandı ve çoğu teste bağlandı. En önemlisi: performans testi sırasında menüye
  dönülünce kapanmış oturuma dokunup Rapier fizik dünyasını bozması (sayfa yenilenmeden yeni oyun başlamıyordu).
  Diğerleri: "Tüm ayarları sıfırla"nın çalışmaması, şehir merkezinde deniz yansıması, AO geçişinde gölge haritalarının
  yeniden çizilmesi, araçtayken başlayan test, 600 karelik pencere, yolcunun yanlış lastik sesi, görsel testte ortam
  ışığı; düşük öncelikli: GPU kesintisi, bot hasarı, otomatik kayıt, dinamik çözünürlük, `waterRefl` anahtarı, gölge
  aç/kapa yeniden derleme, görsel testte ön ayar/görüş mesafesi, lastik döngüsü sızıntısı. Bulgu başına üç
  doğrulayıcının turu (67 ajan, ~2,7 saat) uzun sürdüğü için düzeltmeler sonuç beklenmeden uygulandı. Sonuç: 9 bulgu
  doğrulandı (oylar 3/3 ya da 2/3; hepsi düzeltilmişti), 12'si reddedildi. Reddedilenlerin doğrulayıcıları
  düzeltmelerden sonra çalıştı; 36 olumsuz oyun hepsi gerekçe olarak düzeltilmiş kodu gösteriyor (ör. menüye dönüşte her
  beklemeden sonraki oturum denetimi ve atlanan fizik çağrıları). Yani bu reddedilmeler bulguya itiraz değil, düzeltmenin
  bağımsız bir kod okumasıyla teyidi. Testler sırasında ayrıca NaN kara kare, AO gizli çatı hayaleti, görsel testin
  Düşük ayarla ve rastgele araç hasarıyla çalışması bulunup düzeltildi.
- **Regresyon:** birim testleri 47/47; uçtan uca 27/27 (tam koşu 26/27 + `benchmark` yeniden koşusu, §8); görsel
  regresyon Aşama 8 tabanına göre ≤ %0,06; CI son koşu yeşil. Tam koşunun sonunda bütün çok oyunculu senaryolar
  (`multiplayer-6` 289 sn, `multiplayer-local` 294 sn, `carry-mp` 296 sn, `host-migration` 608 sn, `host-migration3`
  866 sn) ve hikâye/final/oynanış senaryoları değişmeden geçti. CI'da genişletilen `ui-clicks` önce bir tıklamada 10 sn
  zaman aşımına uğradı (yazılım GPU'sunda yeni gölgelendirici derlenen kareler); tıklamalara adım adı ve 60 sn tavan
  verildi, kalite denetimi gölgesiz "Düşük" ön ayarıyla yapıldı, CI yeşile döndü.
- **Yapılmadı / sınırlar:** gerçek ekran kartlarında ölçüm (ortamda yalnız yazılım GPU'su); 1080p/60 FPS hedefi
  doğrulanamadı; Ultra'nın AO ve yansıması sahneyi bir kez daha çizer (çizim çağrısı Yüksek'in 1,4–1,6 katı, göl
  yakınında ~6 katı), orta sınıf GPU'da Yüksek önerilir; ekran uzayı yansıması (SSR) ve HDRI dosyası yok (ortam ışığı gökyüzü
  gölgelendiricisinden üretiliyor).

## 6. Test edilemeyenler
- **Gerçek internet üzerinden WebRTC/TURN bağlantısı:** ortamın ağ kısıtı. TURN yapılandırması birim testiyle ve kod
  incelemesiyle doğrulandı; aynı protokol yerel taşıyıcıyla (iki/üç sekme, 6 oyunculu ortam) test edildi.
- **Gerçek ekran kartında performans:** yalnız yazılım GPU'su (SwiftShader) var; FPS değerleri gerçek donanımı temsil
  etmez, 1080p/60 FPS hedefi doğrulanamadı. Ölçümler kalite seviyelerinin yükü (çizim çağrısı, üçgen, AO/yansıma
  geçişleri) için kullanıldı. Oyuncunun kendi donanımında ölçmesi için oyun içi performans testi var.
- **Hoparlörden duyulan ses:** ses grafiği (HRTF, yankı, oklüzyon, sentez sesler) başsız tarayıcıda çalıştırıldı ama
  dinlenemedi; sesli sohbetin 3B konumlandırması mikrofon/hoparlör olmadığı için yalnız kod incelemesiyle.
- **Fare işaretçi kilidi:** test koşucusu kilidi kapatır (başsız kabuktaki imleç döngüsü, §2); gerçek tarayıcıda
  elle denenmedi.
- **Altı gerçek oyun sekmesi:** 6 oyunculu ortam 2 gerçek sekme + 4 protokol düzeyi sahte eşle; dörtten fazla gerçek
  sekmeyle host göçü denenmedi.
- **Öznel nitelikler:** hareketin "robotik/kaygan" hissettirmemesi, görsel kalitenin "belirgin" artışı ölçümlerle ve
  ekran görüntüleriyle desteklendi ama bir oyuncu tarafından değerlendirilmedi.

## 7. Kabul kriterleri (istemin 17. bölümü)
| # | Ölçüt | Durum | Kanıt |
|---|---|---|---|
| 1 | Altı karakter görsel olarak ayırt edilebilir | Karşılandı | Aşama 2; `lineup`, görsel regresyon 02 (altı kart) |
| 2 | Hareket robotik/kaygan değil | Kısmen | Hareket motoru (`Motion`, `FootIK`) bu turda değişmedi; durma adımı, denge kaybı, yokuşta gövde eğimi yok. `motion` senaryosunun yamaç bölümü yalnız günlüğe yazıyor (denetimsiz). Oyuncu değerlendirmesi yok |
| 3 | Özel etkileşimler doğru animasyonla | Kısmen | `interact`: hedefe dönme, eylem anına bağlı zamanlama. Kapı/dolap/çekmece/raf/kutu, jeneratör, yakıt, iki kişilik taşıma için özel animasyon yok; çoğu etkileşim genel klibi kullanıyor |
| 4 | Kapılar ve çekmeceler fiziksel | Kısmen | `physics2` (motor, itme, kilit, kırılma, çekmece). Hata: kayıttan yüklemede ve sonradan katılımda kapı durumu fiziğe uygulanmıyor (§10) |
| 5 | Kırılabilir nesnelerin çarpışma alanı güncellenir | Kısmen | `physics2`: kırılan kapının eklemi kalkar, kanat düşer. Dünyadaki çitler ve zayıf yapı parçaları kırılmıyor; mobilya statik |
| 6 | Cephe ve iç mekân belirgin iyileşir | Karşılandı | Aşama 4; `facade` birim testleri, görsel 04/05/07 |
| 7 | Araçlar türlerine göre farklı sürülür | Büyük ölçüde | `vehicles2` (tür ve zemin ölçümleri: tutunma, hız). Zemine göre sarsıntı ve süspansiyon farkı yok |
| 8 | Araç içi etkileşimler çalışır | Kısmen | `vehicles2`: kapı, bagaj, far. Hata: direksiyon simidi yolcu tarafında ve dönüşü görünmüyor; vites/kontrol ayrıntısı yok (§10) |
| 9 | Zombiler kalabalıkta takılmaz | Kısmen | Aşama 6; `ai2`: 12 zombi aynı noktadan 3 sn'de ayrıştı, oyuncunun içinden geçmedi. 40'lık sürüde takılma ölçülmedi; çok kalabalıkta yol bulma bütçesi kısa takılmalara yol açabilir (KNOWN_ISSUES) |
| 10 | YZ arkadaşlar kaynak toplar, üs işi yapar | Kısmen | `ai2`: yağma ve yarım yapıyı tamamlama emirleri. Kaynakları üsse taşıma, "araçta bekle" emri, tehlike uyarısı yok |
| 11 | Eşya/araç/animasyon/dünya tutarlı eşitlenir | Kısmen | Eşya (`carry-mp`), animasyon ve dünya (`multiplayer-6`, host göçü) denetleniyor; araç eşitlemesi kodda var ama çok sekmeli hiçbir senaryoda denetlenmiyor, `multiplayer-local` denetimsiz; PeerJS ile uçtan uca yok |
| 12 | TURN ile gerçek internet bağlantısı test edilir | **Karşılanamadı** | Ortamda internet üzerinden TURN yok; yapılandırma + birim testi var |
| 13 | Host ayrılması ve yeniden bağlantı doğrulanır | Kısmen | `host-migration`, `host-migration3`, `multiplayer-6`: host sekmesi kapanınca/düşünce göç ve yeniden bağlanma doğrulandı. Host "Ana Menüye Dön" ile bilerek ayrılınca göç yok, oyun herkes için kapanıyor; göçte gün kilitli görevlerin açılması ve bot çantaları kayboluyor (§10) |
| 14 | Test bağımlılıkları temiz kurulumda çalışır | Karşılandı | Aşama 1; Playwright `package.json`/kilit dosyasında, CI `npm ci` + `npx playwright install` |
| 15 | CI yayın öncesi testleri çalıştırır | Kısmen | `ci.yml` her gönderimde birim + `smoke-menu` + `ui-clicks`; `pages.yml` yayından önce birim testlerini koşar ama depo şu an "Deploy from a branch" ile yayınlandığı için canlı yayın testleri beklemiyor |
| 16 | Gerçek donanımda performans raporu | **Karşılanamadı** | Yalnız yazılım GPU'su; oyun içi performans testi ve JSON çıktısı eklendi |
| 17 | Hikâye, kayıt, görev, finaller korunur | Büyük ölçüde | `story`, `ending`, `gameplay` hatasız koşuyor ve final sonuç ekranına ulaşıyor, ama üçünde de değer denetimi yok (yalnız çökme/zaman aşımıyla düşer) |
| 18 | Ana menü ve oyun içi butonlar gerçek tıklamayla çalışır | Büyük ölçüde | `ui-clicks`: ana menünün altı ekranı + geri, ayar sekmeleri ve kalite seçimi, Tek Oyna → Oyuna Başla, oyunda günlüğün altı sekmesi, duraklat → Ayarlar/Nasıl Oynanır?/Devam Et gerçek fare tıklamasıyla; diğer paneller (inşa, takım, depo, tüccar) işlevleri doğrudan çağıran senaryolarla, yıkıcı düğmeler tıklanmadı |

## 8. Test sonuçları (son koşu, Aşama 8 kodu)
Özellik turundan sonraki son koşu (32 senaryo) §11'de.
- **Birim testleri (`npm test`):** 47/47 (9 dosya; dosya başına kapsam `TEST_REPORT.md`'de). Turun başında 31.
- **Uçtan uca (`node tools/e2e.mjs`, 27 senaryo, sırayla, yazılım GPU'su):** 27/27. Tam koşuda (92 dk) 26/27:
  `benchmark` yalnız yeni eklenen iptal sonrası denetiminde düştü (yeni oyunda fiziğin 3 sn içinde ilerlemesi
  bekleniyordu, yazılım GPU'sunda yeni dünyanın ilk kareleri ~7 sn sürüyor). Denetim "3 dk içinde 30 fizik adımı" oldu;
  oyun kodu değişmeden yeniden koşuldu ve geçti (37 sn'de 30 adım). Senaryo başına süre ve kapsam `TEST_REPORT.md`'de.
  Turun başında 18 senaryo vardı; 9 yeni senaryo eklendi. **Uyarı:** 27 senaryonun 16'sında değer denetimi yok (ai,
  audio, carry, ending, gameplay, lineup, living, mobs, motion, multiplayer-local, nature, physics, regions, smoke-menu,
  smoke-single, story); bunlar yalnız sayfa hatası, çökme ya da bekleme zaman aşımıyla başarısız olabilir. "Geçti"
  onlar için "hatasız koştu" demektir, davranışın doğru olduğunu kanıtlamaz (§10).
- **Görsel regresyon:** Aşama 7 → 8, Orta kalite, 14 görüntü: 13'ünde fark %0–0,07; araç dışı Aşama 7'de siyah kare
  (düzeltilen hata). Tam koşuda Aşama 8 tabanına göre ≤ %0,06. Ultra görüntüleri ve karşılaştırma `docs/img/`.
- **Performans:** yalnız yazılım GPU'sunda (Aşama 8 bölümündeki tablo); gerçek donanım ölçümü yok (§6).
- **CI:** her gönderimde birim testleri + `smoke-menu` + `ui-clicks` (GitHub Actions, Ubuntu); bu turun son koşuları
  yeşil.

## 9. Bilinen kalan sorunlar (özet; tamamı `KNOWN_ISSUES.md`)
- Teslimden sonraki denetimin bulduğu ve henüz düzeltilmeyen hatalar (§10): kayıttan yüklemede/katılımda kapı fizik
  durumu uygulanmıyor; patlama itkisi kütleden bağımsız aynı hızı veriyor; bazı kadın kafalarında göz/çene renkleri
  yanlış; host bilerek ayrılınca göç yok; göçten sonra gün kilitli görevler açılmayabilir; iki kopya sistem.
  (Direksiyonun yolcu tarafında olması, patinaj sesinin çalmaması, göçüğün yanlış parçada çıkması ve bozuk farın
  sönmemesi 1 Kasım özellik turunda düzeltildi, §11.)
- 1 Kasım özellik turunun sınırlamaları (§11 ve `KNOWN_ISSUES.md`): kulelerin yalnız zemin katı girilebilir; dolap
  kapakları görseldir (çarpışma almaz); yanmış arabalar dekor; sığınaklara iniş kararmalı ışınlama; botlar yalnız
  "Takip et" emrindeyken sığınağa iner.
- Gerçek internet üzerinden TURN bağlantısı, gerçek ekran kartında performans ve hoparlörden ses test edilemedi (§6).
- Lobide host düşerse göç yok (oda kapanır); fizik nesnelerinin ara konumları istemcilerde yerel.
- Çok kalabalık sürülerde (40+) zombilerin kısa takılması ölçülmedi; yol bulma bütçesi sınırlı.
- Botlar araç sürmez, kendi başına savunma inşa etmez.
- Araç kapı/bagaj kanatları gövdeden ayrı model değil; kabin bütün araçlarda aynı prosedürel set.
- Kıyafetlerde kumaş dokusu/normal haritası ve daha ayrıntılı saç geometrisi yok.
- Ekran uzayı yansıması (SSR) ve HDRI dosyası yok; su yansıması yalnız en yakın su yüzeyinde.
- Ultra, orta sınıf ekran kartı için ağır olabilir (çizim çağrısı Yüksek'in 1,4–1,6 katı, göl yakınında ~6 katı).
- Mobil/dokunmatik kontrol yok.

## 10. Bağımsız eksiksizlik denetimi (teslimden sonra, 1 Kasım 2026)
"Tamamlandı mı?" sorusuna dürüst cevap vermek için istemin 18 bölümü 10 gruba ayrılıp her grup bir denetçiyle kod,
test ve belgelerle madde madde karşılaştırıldı; "kısmi/yok ve belgelenmemiş" her aday ayrı bir doğrulayıcının çürütme
denemesinden geçti. Ayrıntı ve tam liste: `docs/DENETIM_NL2.md`.

| Bölüm | Tam | Kısmi | Yok | Zaten belgeli eksik | Doğrulanan belgesiz eksik | Çürütülen aday | Belirsiz |
|---|---|---|---|---|---|---|---|
| §1–2 Projeyi koru, öncelikler | 14 | 10 | 1 | 5 | 5 | 1 | 0 |
| §3 Karakter sistemi | 10 | 13 | 2 | 3 | 10 | 2 | 0 |
| §4–5 Hareket motoru, etkileşim animasyonları | 6 | 12 | 8 | 1 | 19 | 0 | 0 |
| §6 Fizik | 14 | 10 | 1 | 0 | 8 | 3 | 0 |
| §7 Harita ve çevre | 11 | 11 | 4 | 7 | 6 | 2 | 0 |
| §8 Araçlar | 7 | 15 | 3 | 3 | 15 | 0 | 0 |
| §9–10 Zombi YZ, YZ takım arkadaşları | 8 | 15 | 2 | 1 | 13 | 3 | 0 |
| §11–12 Çok oyunculu, ses | 11 | 14 | 0 | 2 | 9 | 3 | 0 |
| §13–15 Grafik/performans, test altyapısı, görsel regresyon | 13 | 9 | 4 | 6 | 7 | 0 | 0 |
| §16–18 Aşamalı plan, kabul kriterleri, teslim raporu | 7 | 17 | 1 | 10 | 8 | 0 | 0 |
| **Toplam** | 101 | 126 | 26 | 38 | 100 | 14 | 0 |

- **Sonuç:** sekiz aşama uygulandı, ama istemin 253 ayrıntılı talebinin yalnız 101'i tam karşılandı; 126'sı kısmi,
  26'sı yapılmadı. Kısmi/yok olanların 100'ü bu raporda önceden yazmıyordu (14 aday elendi). Kabul kriterleri (§7) bu
  denetime göre düzeltildi.
- **En büyük açıklar:** hareket motoru ve ayak IK'sı bu turda hiç değişmedi (durma adımı, denge kaybı, yokuşta gövde
  eğimi yok); özel etkileşim animasyonları (kapı, dolap, çekmece, jeneratör, yakıt, iki kişilik taşıma) yok; itilebilir
  mobilya ve kırılabilir çit/zayıf yapı yok; araçta zemine göre sarsıntı/süspansiyon ve vites/kontrol ayrıntısı yok;
  botlarda kaynakları üsse taşıma ve "araçta bekle" emri yok; fizik, araç ve eşya paylaşımı için birim testi yok.
- **Bulunan hatalar** (düzeltilmedi; ayrıntı `docs/DENETIM_NL2.md`): kayıttan yüklemede ve sonradan katılımda kapı
  durumu fiziğe uygulanmıyor; direksiyon simidi yolcu tarafında; patinaj sesi hiç çalmıyor; araç göçüğü çoğu modelde
  görünmüyor ya da ters uçta; bozuk far ışığı sönmüyor; patlama itkisi her gövdeye aynı hızı veriyor; bazı kadın
  kafalarında göz ve çene renkleri yanlış; host bilerek ayrılınca göç yok; göçten sonra gün kilitli görevler açılmayabilir;
  iki kıpırdanma zamanlayıcısı ve iki zemin sınıflayıcı (istemin "ikinci sistem kurma" kuralı); ayakkabı tabanı yuvası
  ölü kod.
- **Test kapsamı:** 27 uçtan uca senaryonun 16'sında değer denetimi yok (§8); `motion` senaryosunun yamaç bölümü
  başarısız olamaz.
- **Süreç:** istem ayrı bir geliştirme dalı istiyordu; bütün iş GitHub Pages'ten doğrudan yayınlanan tek dalda yapıldı,
  her ara aşama canlıya gitti.

## 11. Özellik turu (1–2 Kasım 2026): binalar, dolaplar, araçlar, gündüz/gece, yer altı sığınakları
İstek: "Her binaya girebilelim. Dolapları çekmeceleri açtığımızda fiziksel olarak da açıldığını görebilelim. Araçlar
kullanılabilir olsun. Gündüz vakti sadece loot yapalım, zombiler gece olunca ortaya çıksın, gündüz başka sorunlar olsun.
Sığınaklar olsun, yer altlarında oralara girebilelim." Her özellik ayrı commit olarak gönderildi (`42085cf` ve `84d9c08`
araçlar, `bbe2743` binalar, `41302af` dolaplar, `dbe115f` gündüz/gece, `5fb38f7` sığınaklar), ardından bağımsız
inceleme düzeltmeleri (`d2eb253` ve `6c1fe8b`); aradaki `7a45173` incelemeden önceki küçük düzeltmelerdir (gündüz
tehditleri üste ve sığınakta başlamıyor, ayrıldıktan sonra gelen host iletisi çökertmiyor, sığınak kapısı önü boş).
Belge doğrulamasının bulduğu üç kod eksiği (aşağıda) son düzeltme commit'inde tamamlandı.

| İstek | Durum | Ne yapıldı | Kanıt (otomatik test) |
|---|---|---|---|
| Her binaya girilebilsin | Karşılandı (kulelerde yalnız zemin kat) | 11 MegaKit kulesinin zemin katı, 5 dekor ev ve cami girilebilir bina oldu (toplam 86); verandasız kapılardaki eşik basamağı hatası (yalnız zıplayarak giriliyordu) düzeltildi; kapı pervazları yol ızgarasında kapıyı kapatmıyor: zombiler kapalı kapıyı zorlayarak, botlar açık kapıdan her binanın içine yol buluyor (botlar kapı açmaz; NPC'ler yol ızgarası kullanmaz, hedefe düz yürür) | `buildings`: 86 binanın her birine dış kapıdan yürüyerek giriliyor; kulelerde kamera tavan altında; eski kapı/pencere kimlikleri kaymıyor |
| Dolap/çekmece fiziksel açılsın | Karşılandı (kapaklar görsel) | Gardırop/dolap kanatları, buzdolabı/fırın kapakları, ecza dolabı, kasa, içecek dolabı, tezgâh, sandık kapakları, alet dolabı çekmeceleri arama ve depo paneli sırasında menteşesinden açılıyor; aranmış dolap aralık kalıyor; kullanım çok oyunculuda ve host göçünde eşitleniyor; fizikli çekmeceler mobilyanın gerçek ön yüzüne oturuyor | `fronts` (12 türde aç/kapa/aralık, kilitli kasa, başkasının kullanımı, çekmece yön/yükseklik); `multiplayer-local` (istemcinin açtığı dolap host'ta açık) |
| Araçlar kullanılabilsin | Karşılandı | Yoldaki 23 terk edilmiş araba binilip sürülen gerçek araç (az yakıt, bazılarında patlak lastik/bitik akü, bagaj yağması); iki yandan binme; çok oyunculuda host'un kendi aracını sürememesi, yolcunun aracı hareketsiz görmesi ve park hâlindeki araçların eşitlenmemesi düzeltildi; park etmiş araç mermiyi ve görüşü kesiyor | `vehicles3`, `vehicles2`, `multiplayer-local` (host sürüşü) |
| Gündüz yağma, gece zombi, gündüz başka sorunlar | Karşılandı | Doğal zombiler alacakaranlıkta (20.30) topraktan çıkıyor, şafakta (06.00) toprağa dönüyor; gündüz olay zombileri geceye erteleniyor; gündüz yağmacı devriyeleri, başıboş köpek sürüleri, güneş çarpması; gece açıkta uyku yavaş (×8), sığınakta ya da korunaklı üste hızlı (×40); hasar uyandırır | `daynight` (öğlen 0 zombi; alacakaranlıkta yakında çıkış; şafakta hepsi döner, ölü sayılmaz; devriye, köpek, sıcak çarpması, açıkta uyku, alacakaranlıkta uyku yavaşlar, hasar uyandırır ve oyu geri çeker) |
| Yer altı sığınakları | Karşılandı (iniş kararmalı ışınlama) | 8 sığınak (şehir, hastane, askerî, çiftlik, orman mağarası, fener, maden galerisi, laboratuvar B1); kilit (levye/maymuncuk, anahtar kartı), jeneratörle ışık, ganimet, güvenli uyku (dördünde hazır yatak, öbürlerinde uyku tulumuyla); zombiler ve hayvanlar inemez, toprağın öbür yanındakini algılayamaz (yer altındaki silah sesi yüzeyde yine duyulur); patlama/zehir/ateş katlar arasında geçmez; takipçi botlar ve eskort NPC'ler iner/çıkar; ev sığınağı aynı sisteme bağlandı | `shelters` (8 sığınağa iniş, odalarda yürüme, bütün odalara/konteynerlere/çıkışa/jeneratöre erişim, E ile inip çıkma, kilitler, kamera, yağmur ve deniz gizli, zombi algısı, ışık, ganimet, uyku, kayıt, ev sığınağı, bot) |

### Bağımsız inceleme
Beş özelliğin her biri ayrı bir inceleyiciye verildi (kodu ve testleri okuyup hata arayan); her aday bulguyu ikinci bir
doğrulayıcı commit `7a45173` üzerinde çürütmeye çalıştı.

| Alan | Aday | Doğrulanan | Çürütülen | Önemli doğrulanan bulgular (hepsi düzeltildi) |
|---|---|---|---|---|
| Dolaplar ve çekmeceler | 6 | 5 | 1 | yarıda kalan bot araması dolabı oturum boyunca "kullanımda" bırakıyordu; host göçünde açık dolaplar herkeste açık kalıyordu; her arama başka oyuncuların kapaklarını kapatıp çekmece sesi çalıyordu |
| Binalar | 8 | 8 | 0 | küçük kulelerin kapı eşiğinde yürünebilir zemin yoktu (zombi/NPC zeminin altına düşüyor, botlar takılıyor); yol bulma hiçbir kulenin içine ulaşamıyordu; kamera tezgâhtayken tavana giriyordu; kule içinde yağmur yağıyordu; camide ayakkabılık hiç çıkmıyordu, kitaplıklar minberin içindeydi, köy camisinin mihrabı kıbleye bakmıyordu |
| Araçlar | 8 | 8 | 0 | yolcu olan istemci aracının hareketini görmüyordu; park hâlindeki araçların konumu eşitlenmiyordu; geç katılan dolu koltukları boş görüyordu; eski kayıtlarda terk edilmiş araba bagajları yeniden doluyordu (ganimet çoğalması); terk edilmiş arabalar mermiyi, görüşü ve yol ızgarasını kesmiyordu; oturum başına ~45 araç denetleyicisi sızıyordu |
| Gündüz/gece | 10 | 10 | 0 | 20.30'dan önce uyuyanlar için bütün gece ×40 hızla geçiyordu; köpekler sığınaktaki oyuncuyu ısırıyordu; sabah host göçünde zombiler toprağa dönmüyordu; yeni host eski planı oynatıp gündüz sürü doğuruyordu; hasarla uyanınca uyku oyu geri çekilmiyordu; alacakaranlık/şafak duyuruları büyük kare adımında atlanıyordu |
| Yer altı sığınakları | 11 | 11 | 0 | yüzey ortam ışığı her karede 0,85'ten 0,35'e düşürülüyordu (bütün oyun karanlık); kurt, ayı, domuz ve köpekler 9–12 m kayanın içinden algılayıp ısırıyordu; patlama ve zehir bulutları sığınaktakileri etkiliyordu; sığınakta atılan molotof yüzeyde yanıyordu; botlar tavanın üstündeki zombilerle dövüşüyordu; ağ protokol sürümü artırılmamıştı |
| **Toplam** | **43** | **42** | **1** | |

- Çürütülen tek aday: kapak çiziminde kare başına küçük bellek ayırma ve 0,5 sn'de bir renk/matris yeniden yüklemesi.
  Doğrulayıcı olguları doğruladı ama ölçülebilir bir etki, yanlış davranış ya da sızıntı bulmadı (en fazla 6 × 32 KB
  matris tamponu, saniyede iki kez); düzeltilmedi.
- Doğrulayıcıların düzeltme notları da son commit'te uygulandı: açıkta uyku uyarısı ilk oyda da çıkıyor; darbeyle yere
  düşen uyuyanın oyu geri çekiliyor; sığınaktaki oyuncu yüzeydeki hayvanı yakın dövüşle vuramıyor ve yer altındaki
  oyuncunun çevresinde hayvan doğmuyor; duvara çarpan molotof havada değil dibindeki zeminde yanıyor; yer altındaki
  hiçbir çarpıştırıcı yüzey yol ızgarasına basılmıyor; ateş ve yapı ışıkları bulundukları kata göre seçiliyor; tuzak ve
  alarm başka kattaki zombiye tepki vermiyor.
- Tablodaki bir madde yarım kalmıştı ve belge doğrulaması (aşağıda) bunu yakaladı: terk edilmiş arabalar mermiyi,
  görüşü ve zombi/bot geçişini kesiyordu ama yol ızgarasına basılmıyordu (zombi ve botlar yolu arabaların içinden
  planlıyor, zombi araç içinde doğabiliyordu). Son düzeltme commit'inde park etmiş araçlar yol ızgarasına girdi.
- Ertelenen olay zombilerinin "kovala" hedefi taşınmıyor: topraktan çıkan zombi zaten hedefsiz başlıyor (çıkış
  animasyonu hedefi siliyor), oyuncuyu algılayınca kovalıyor.

### Belge doğrulaması
Teslim belgelerindeki (§11, `KNOWN_ISSUES.md`, `ARCHITECTURE.md`, README) her somut iddia koda karşı denetlendi:
dört denetçi 323 iddiayı kodla karşılaştırdı, ayrı şüpheci doğrulayıcılar her bulguyu çürütmeye çalıştı. 26 aday
bulgunun 17'si doğrulandı ve belgeler düzeltildi, 9'u çürütüldü. Doğrulananların üçü belge değil kod eksiğiydi ve
kodda düzeltildi:
- Park etmiş araçlar yol ızgarasında değildi (yukarıdaki yarım kalmış inceleme maddesi): artık boş araç ızgarada
  engel; vekiller yer değiştirince ya da biri binince/inince ızgaranın o alanı yeniden çiziliyor.
- Araç vekil daireleri uzun araçlarda aracın ortasında 0,15–0,83 m'lik yarık bırakıyordu (mermi, görüş ve NPC
  geçiyordu): daireler yarı genişlik yarıçapla ve en fazla bir yarıçap aralıkla yerleşiyor, ortada yarık yok.
- Bot, yere düşmüş başka bir botu kaldırmaya giderken kat denetimi yapmıyordu (insan oyuncular için yapıyordu).
Belgede düzeltilenlerden bazıları: botlar kapı açmaz (yalnız açık kapıdan girer), NPC'ler yol ızgarası kullanmaz;
sığınakların dördünde hazır yatak yok (uyku tulumu gerekir); dolap kapakları görseldir, fizikli olanlar
çekmecelerdir; uyku için oyuncuların yarıdan fazlası gerekir; yanmış ve birkaç dekor araç binilemez; istemci park
etmiş arabayı itemez; olay zombilerinin ertelenme saatleri (20.35, sürüler 20.55).

### Test sonuçları (bu turun son kodu)
Tam regresyon (32 senaryo, sırayla) `6c1fe8b` üzerinde koşuyor; sonuçlar bu alt bölüme işlenecek. Şimdiye kadar:
birim testleri 47/47; değişen sistemlere dokunan `daynight`, `shelters`, `ai`, `buildings` hatasız. `ai2` testin yalıtım
eksiği yüzünden düştü (takipçi botlar testin zombileriyle dövüşüyordu), `edc311d`'de düzeltildi ve üç koşuda geçti.

### Bu turun sınırlamaları (ayrıntı `KNOWN_ISSUES.md`)
- Kulelerin yalnız zemin katı girilebilir; üst katlar dış kabuk.
- Dolap kapakları görseldir (çarpışma almaz); yalnız oda kapıları ve fizikli çekmeceler fizik nesnesi.
- Yanmış arabalar dekor; terk edilmiş arabaların yakıtı/arızası tohumla aynı.
- Sığınaklara iniş/çıkış kararmalı ışınlama; odalar prosedürel kutular; sığınaklara yapı kurulamaz.
- Botlar yalnız "Takip et" emrindeyken sığınağa iner; sığınak içinde uzak odalara giderken duvara takılabilirler.
- Eski sürümle açık kalmış sekmeler yeni host'a katılamaz (protokol 6): sayfa yenilenmeli.
- Bitki yerleşimi kısmen değişti: orman sığınağının girişi bitki dağılımının rastgele sayı sırasını kaydırdı; Aşama 8'e
  göre ağaçların %87,4'ü, çimenlerin %52,9'u aynı yerde (oynanışa ve kayıtlara etkisi yok).
