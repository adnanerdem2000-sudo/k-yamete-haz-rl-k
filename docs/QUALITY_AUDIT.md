# Kalite Denetimi — "Next Level" Teknik Analiz

Tarih: 31 Ekim 2026 · Kapsam: 16 sistem · Yöntem: kod incelemesi + oyun içi ekran görüntüleri + otomatik testler.
Her başlıkta: **şu an nasıl çalışıyor → neden basit görünüyor → teknik eksikler → sorumlu dosyalar → korunacaklar /
değişecekler → plan**. Son bölümde asset araştırması ve aşama planı var.

---

## 1. Karakter modelleri
- **Şu an:** İki Quaternius tabanı (erkek "Adventurer", kadın "Hooded Adventurer"; 62 kemikli CharacterArmature).
  Parçalar bağlama pozunda tek deri ağına birleştiriliyor, renkler köşe rengi "yuvaları" ile boyanıyor; saç/şapka/
  gözlük/çanta prosedürel aksesuarlar (`CharacterFactory.js`).
- **Neden basit:** Altı karakterin hepsi aynı iki gövde siluetinden üretiliyor; fark yalnızca renk ve aksesuar.
  Kıyafet geometrisi yok (tişört de mont da aynı gövde), yüzler çok sade, malzemeler düz renk (doku/normal yok).
- **Eksikler:** kıyafet çeşitliliği, yüz/saç detayı, kumaş hissi, ikincil hareket (saç, çanta), kişiye özel duruş.
- **Dosyalar:** `src/entities/CharacterFactory.js`, `CharacterRig.js`, `Avatar.js`, `src/core/Assets.js`, `tools/pack-rigged.mjs`.
- **Korunacak:** birleştirilmiş tek deri ağı (çizim çağrısı 1–3), görünüm (look) veri biçimi, kayıt uyumu, ağ kodlaması.
- **Plan:** Quaternius **Ultimate Modular Men/Women** (CC0, *aynı 62 kemikli iskelet*) parçalarıyla karakter başına
  gerçek kıyafet silueti (işçi, punk, kapüşonlu, çiftçi, takım, gündelik, resmi…). Malzeme tabanlı yuvalar,
  kumaş/deri için ince normal + pürüzlülük, saç ve çantaya yay tabanlı ikincil hareket, karakter başına duruş.

## 2. Karakter hareket sistemi
- **Şu an:** Rapier kinematik karakter denetleyicisi; `damp` ile ivmelenme, yürü/koş/sprint, eğil/sürün, zıpla,
  takla, merdiven, yüzme (`Player.js`, `PhysicsWorld.js`). Basamak/eğim çalışıyor (fizik testi ölçüyor).
- **Neden basit:** Hız değişimi tek bir sönüm katsayısıyla; dönüşte ağırlık aktarımı, ani yön değiştirmede denge,
  duruşta "fren adımı", yokuşta gövde eğimi yok. Görsel olarak buz üzerinde kayma hissi oluşuyor.
- **Plan:** hız eğrileri (ivme/yavaşlama ayrı), dönüş hızı sınırı + gövde yatışı, ani dönüşte denge katmanı,
  durma adımı, eğime göre gövde eğimi, adım fazına bağlı ayak kilidi (kaymayı azaltır).

## 3. Animasyon sistemi
- **Şu an:** Taban modelin 24 klibi (Idle, Walk, Run, Run_Back/Left/Right, Death, Punch…) + prosedürel poz
  katmanları (eğilme, sürünme, tırmanma, yüzme, araç, uyku, yakın dövüş) + kol IK'sı + ayak yerleştirme.
- **Neden basit:** Eğilerek yürüme, sürünme, merdiven, eşya alma, sandık açma, yemek, tamir gibi hareketler el
  yapımı prosedürel pozlarla; çapraz yönler yok; zıplamanın başlangıç/iniş fazları yok; etkileşim animasyonları kısa
  ve robotik.
- **Plan:** Quaternius **Universal Animation Library 1 + 2** (CC0, 254 klip) çevrimdışı olarak bizim iskelete
  aktarılır (dünya uzayında, T-pozuna göre göreli dönüş eşlemesi). 8 yönlü yürüme/koşu/eğilme, sürünme, sprint
  giriş/çıkış, zıplama fazları, yerinde dönüş, merdiven, engel atlama, taşıma, itme, eşya alma, sandık açma, tamir,
  bandaj, yeme-içme, odun kesme, kazma, balık, tarım, oturma, yatma/kalkma, darbe/ölüm/kalkış, yakın dövüş kombo,
  tabanca nişan/atış/doldurma, fırlatma, ifadeler; zombiler için yürüme/koşu 8 yön, ısırma, tırmalama, yerden çıkma.

## 4. Kamera sistemi
- **Şu an:** Omuz üstü üçüncü şahıs; mesafe sönümlü, duvar ışını ile içeri çekiliyor (`Player.updateCamera`).
- **Neden basit:** Pivot oyuncuya kilitli (gecikme yok), engelden çıkınca ani sıçrama, FOV sabit, koşu/sprint/iniş
  geri bildirimi zayıf, savaşta çerçeve değişmiyor.
- **Plan:** yaylı pivot takibi (hıza göre gecikme), engelde hızlı içeri / yavaş dışarı, sprintte FOV +6°,
  koşuda hafif sallantı, nişanda omuz kayması ve FOV daralması, iç mekânda yakın mesafe, iniş darbesi.

## 5. Fizik motoru
- **Şu an:** Rapier 3D, 60 Hz sabit adım + enterpolasyon; karakter, araç (ışın tabanlı), itilebilir/patlayan
  nesneler, enkaz, savrulan cesetler, halatla çekilen enkaz (`PhysicsWorld.js`, `PhysProps.js`, `Vehicles.js`).
- **Eksikler:** mobilya (sandalye, masa) fiziksel değil; çarpışma sesleri kütleye bağlı değil; suya düşen nesnelerde
  kaldırma kuvveti yok; kapı fiziksel menteşe değil (animasyonlu döner).
- **Plan:** iç mekânda seçili hafif mobilyayı dinamik yap (uyku/LOD ile), temas olaylarından kütle/hıza göre çarpma
  sesi, su içinde kaldırma kuvveti + sönüm.

## 6. Çarpışma ve etkileşim
- **Şu an:** Etkileşim noktaları mesafe/açı puanıyla seçiliyor (`Interact.js`); basılı tutma çubuğu; kapı/pencere
  /konteyner/araç/NPC.
- **Eksikler:** karakter etkileşim anında nesneye yönelmiyor, el-nesne hizalaması yok, animasyon çoğu kez genel
  "interact" pozu.
- **Plan:** etkileşim türüne göre klip (kapı → Interact, dolap → Chest_Open, yer → PickUp_Kneeling, tamir →
  Fixing_Kneeling, bandaj → Bandage_Loop…), etkileşimden önce hedefe dönme ve kısa yaklaşma.

## 7. Harita ve çevre
- **Şu an:** 2 km ada, 18 bölge, prosedürel arazi ve yollar, örneklenmiş bitki örtüsü (`Terrain.js`,
  `Vegetation.js`, `WorldBuilder.js`, `RegionsExtra.js`).
- **Neden basit:** Ağaçlar ikosahedron "top"lar + silindir gövde, çim tek tip, kayalar az; arazi köşe rengi
  (doku yok); bölgeler arası mimari ve bitki çeşitliliği sınırlı; sokak mobilyası az.
- **Plan:** Quaternius **Stylized Nature MegaKit** (CC0: 5'er ağaç türü, çalı, eğrelti, çiçek, çim, mantar, kaya,
  çakıl, patika taşları, kabuk/yaprak dokuları) ile ormanlar; arazide PBR doku harmanı (çim/toprak/kaya/kum);
  **Downtown City MegaKit** cephe dokuları; sokak lambası, trafik ışığı, tabela, bank, çöp kutusu.

## 8. Bina modelleri
- **Şu an:** şablonlardan prosedürel duvar/kapı/pencere/çatı + mobilya (`BuildingGen.js`, `BuildingTemplates.js`,
  `Furnish.js`), dokular canvas ile üretiliyor (`TextureFactory.js`).
- **Neden basit:** Duvar yüzeyleri düz, pencere çerçeveleri/denizlik/saçak/oluk/klima gibi detaylar az; tüm evler aynı
  malzeme ailesinden; iç mekân aydınlatması yok.
- **Plan:** PBR tuğla/beton/sıva/çatı kiremidi (normal + ORM), pencerelerde "iç oda" dokusu (gece ışıklı odalar),
  cephe süsleri; evlerde durum çeşitliliği (yağmalanmış / barikatlı / terk edilmiş).

## 9. Araçlar
- **Şu an:** Kenney araç modelleri + ışın tabanlı araç fiziği (süspansiyon, tutunma sınırlı direksiyon, fren,
  devrilme önleyici, hasar), motor ve kayma sesi.
- **Eksikler:** boya/cam malzemesi ortam yansıması almıyor, fren lambası ve far ışığı yok/zayıf, direksiyon ve kapı
  animasyonu yok, zemine göre (çamur/çakıl) davranış farkı sınırlı.
- **Plan:** HDRI tabanlı yansıma ile boya/krom/cam, fren-geri vites lambası, gece farları (spot ışık), direksiyon
  dönüşü, binerken kapı açılması, zemin türüne göre tutunma ve sarsıntı.

## 10. Zombi modelleri
- **Şu an:** İnsan tabanı + zombi renk tonu + tür eklentileri (sürünen, çığlıkçı, şişkin, çevik kuvvet), köpek.
- **Eksikler:** kıyafet silueti az (hepsi aynı gövde), animasyon prosedürel; yerden kalkma, kapıyı tırmalama, ısırma
  klipleri yok.
- **Plan:** modüler kıyafet parçalarıyla (iş tulumu, takım, plaj, punk…) gerçek çeşitlilik + yırtık/kirli boyama,
  UAL2 zombi klip seti (yürü/koş 8 yön, ısır, tırmala, yerden çık) + darbe/devrilme/kalkma.

## 11. Zombi yapay zekâsı
- **Şu an:** görüş konisi + görüş hattı, ses duyma (gürültü yarıçapı), son görülen yere gitme, sürü, kanat alma,
  hamle, kapı/barikat kırma, çığlıkçı çağrısı (`Zombies.js`).
- **Eksikler:** hedef kaybedilince arama deseni yok (son noktaya gidip dağılıyor), oyuncunun gidiş yönünü tahmin
  etmiyor, kalabalıkta ayrışma (birbirinin içine girme) zayıf, atılabilir dikkat dağıtıcı yok.
- **Plan:** "ara" durumu (son nokta + hız yönünde tahmin + çevresel tarama), komşu itme kuvveti (ayrışma),
  fırlatılabilir şişe/taş ile ses yemi, zombilerin birbirini uyarması.

## 12. Işıklandırma
- **Şu an:** güneş/ay yönlü ışık + yarım küre ışığı, oda ortamı (RoomEnvironment) ile zayıf IBL, PCF gölgeler,
  bloom, renk derecelendirme, sokak lambaları, el feneri.
- **Eksikler:** gökyüzüne uygun HDRI yok (yansımalar sahte), ortam kapatma (AO) yok, iç mekân ışıkları yok, yağmur
  sonrası ıslaklık yok.
- **Plan:** Poly Haven HDRI'ları (CC0) ile günün saatine göre ortam ışığı, SSAO/GTAO (yüksek kalite), ıslak yüzey
  pürüzlülük azaltma, iç mekân lambaları.

## 13. Malzemeler ve dokular
- **Şu an:** canvas ile üretilmiş dokular, çoğu yüzeyde normal harita yok.
- **Plan:** City MegaKit PBR setleri (Concrete, Asphalt, Dirt, RedBrick, RoofSlate, MetalConcrete, MarbleFloor, Trim)
  + Nature MegaKit kabuk/yaprak dokuları; eksik malzemeler için prosedürel normal üretimi.

## 14. Ses tasarımı
- **Şu an (v0.2):** HRTF, oklüzyon, yankı, zemine göre ayak sesi, savaş teması.
- **Eksikler:** nesne çarpma sesi kütleye göre değişmiyor, kapı türleri aynı sesi veriyor, araç lastik sesi zemine
  bağlı değil, zombi saldırı/tırmalama sesleri sınırlı.

## 15. Performans
- **Şu an:** parçalı örnekleme (2 LOD), bina/model örnekleme, dinamik çözünürlük, uzak zombilerde LOD atlama.
- **Riskler:** yeni yüksek detaylı ağaç/karakter/dokular; animasyon sayısı arttıkça karıştırıcı maliyeti.
- **Plan:** yeni bitki için 3 LOD + mesafe ayıklama, doku boyut sınırı (1K) ve WebP, uzak karakterlerde düşük
  frekanslı animasyon güncellemesi, ölçüm sahneleri (kare süresi, çizim çağrısı, üçgen).

## 16. Çok oyunculu senkronizasyon
- **Şu an:** host-otoriter eylem/olay hattı, 15 Hz istemci durumu, 10 Hz anlık görüntü, `compactAnim` ile animasyon
  durumu (mod, hız, yön, takla…).
- **Eksikler:** yeni etkileşim klipleri ve zombi klipleri için ağ alanları gerekecek.
- **Plan:** etkileşim/ifade klip kimliğini ve başlangıç zamanını aktaran kompakt alanlar.

---

## Asset araştırması (lisans ve uygunluk)
Bu ortamdan yalnızca npm ve GitHub'a erişilebiliyor (Kenney, Poly Haven, itch.io, Sketchfab, Mixamo engelli).
Bulunan ve doğrulanan kaynaklar:

| Kaynak | İçerik | Lisans | Uygunluk |
|---|---|---|---|
| `tilakpatell/tilakverse-assets` (GitHub) — Quaternius UAL1/UAL2 | 254 insan animasyonu (UE tipi 65 kemik) | CC0 1.0 (paket içi License.txt) | Klipler bizim iskelete aktarılacak |
| aynı depo — Stylized Nature MegaKit | ağaç, çalı, çiçek, çim, kaya, patika, dokular | CC0 1.0 | Stil uyumlu, yüksek kalite |
| aynı depo — Downtown City MegaKit | cephe modülleri, PBR dokular, iç oda dokuları | CC0 1.0 | Şehir ve bina malzemeleri |
| aynı depo — Street Pack / Furniture Pack / Farm Animals | sokak mobilyası, mobilya, çiftlik hayvanları | CC0 1.0 | OBJ/FBX → glTF dönüşümü gerekir |
| `contato22/awq` (GitHub) — Ultimate Modular Men/Women | 13 kıyafet seti, aynı 62 kemikli iskelet | CC0 1.0 (paket içi LICENSE) | Doğrudan uyumlu |
| `@pmndrs/assets` (npm) — Poly Haven HDRI'ları | 18 HDRI (park, orman, şehir, gün batımı, gece…) | CC0 | Ortam aydınlatması |

Kullanılamayanlar: Mixamo (Adobe hesabı, CC0 değil), Sketchfab (giriş gerekli; çoğu CC-BY/NC), Unity Asset Store
(web/Three.js lisansı uygun değil), Source 2 doku depoları (derlenmiş biçim).

## Aşama planı
1. Karakter modelleri ve kimlikleri · 2. Animasyon kütüphanesi ve etkileşimler · 3. Kamera ve fizik ·
4. Çevre (doğa, şehir, malzeme, yaşayan dünya) · 5. Araçlar · 6. Zombiler · 7. Işık, malzeme, ses ·
8. Çok oyunculu · 9. Performans · 10. Kalite kontrol. Her aşama: incele → uygula → çalıştır → test → düzelt → commit.

---

## İlerleme günlüğü

### Aşama 1 — Karakter modelleri ve kimlikleri (tamamlandı)
- Tüm insanlar (6 ana karakter, 14 NPC, botlar, yağmacılar, zombiler) Quaternius Ultimate Modular Men/Women
  tabanında; kafa/gövde/bacak/ayak setleri karakter başına seçilir, renkler yuvalara boyanır.
- Karakter kimlikleri: Mert (lacivert tulum, kasket, alet çantası/kemeri), Zülal (punk, pembe saç), Deniz
  (kapüşonlu, taktik çanta, eldiven), Elif (avcı yeşili, dürbün, sırt çantası), Bora (iş kıyafeti, baret,
  iri yapı), Ceren (beyaz önlük, gözlük, doktor çantası, stetoskop).
- Özelleştirme ekranı: beden, kafa/saç, üst/alt/ayakkabı setleri ve "özgün renk" seçenekleri.
- Eski tek parça tabanlar (male/female GLB, HumanBase ve eski boyama kodu) kaldırıldı (−1,17 MB, −243 satır).

### Aşama 2 — Animasyon kütüphanesi ve etkileşimler (tamamlandı)
- UAL 1+2'den 154 klip iki iskelete aktarıldı; aktarım hatası (gruplar arasında dinlenme pozunun önceki klibin
  son karesinden alınması) bulunup düzeltildi; tek seferlik kliplerin son karede başa sarması düzeltildi.
- Özel paket biçimi (.kan): 2,7 MB → 590 KB (taban başına), birim testli.
- `Motion` denetleyicisi: 8 yön yürüme/koşu, depar, eğilme (8 yön), sürünme ve yaralı sürünme, yüzme,
  merdiven (yukarı/aşağı/bekleme), havada, sürüş, oturma; faz eşlemeli karışım ve ölçülmüş adım
  mesafesiyle ayak kayması önleme; kişilik beklemeleri; durum geçiş klipleri; yerinde dönüş adımı.
- Eylemler: eşya alma (diz çökerek / koşarken uzanarak), konteyner arama, canlandırma, sargı, yeme, içme,
  çekiç, fırlatma, tabanca doldurma, yumruk/silah savurma, tekme, takla, engel atlama, kenara tırmanma
  (yeni: 1,45–2,35 m basılabilir yüzeyler), isabet tepkileri, ölüm, uyku ve uyanma, sevinme, dans, olta.
- Zombiler: zombi bekleme/yürüme/koşu, tırmalama/ısırma, kapı yumruklama, çığlık, isabet, ölüm; türe göre hız.
- Çok oyunculu: yerel eylemler sıra numarasıyla anim durumunda taşınır; uzak oyuncular aynı klipleri oynar
  (önceden yalnızca takla ve ifadeler görünüyordu). Yorgunluk durumu da eşitlenir.
- Gerçekçi hızlar: eğik 2,0 → 1,7, sürünme 1,0 → 0,65, yaralı 0,55 → 0,45, yavaş yürüme 1,9 → 1,5 m/s,
  merdiven 2,2 → 1,6 m/s (klip adım mesafeleriyle uyumlu).
- Ölçüm: karakter başına animasyon güncellemesi ~0,05 ms, zombi başına ~0,03 ms (yazılım GPU'lu test ortamı).
- Kalanlar (sonraki aşamalar): eğim/merdivende ayak IK'sı, tüfek için klip tabanlı nişan (UAL'de tüfek yok;
  prosedürel kalıyor), kapı açma/çekmece için özel klip (şimdilik "Interact"), ağır nesne taşıma (Walk_Carry).
