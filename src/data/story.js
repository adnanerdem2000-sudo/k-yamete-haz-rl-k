// Hikâye içeriği: keşfedilebilir belgeler, 30 günlük takvim, görevler, NPC'ler, rastgele olaylar ve finaller.
// Evren: 2032. "Proje Kızılçam" — adadaki araştırma tesisinde, çam ormanlarındaki bir mantar
// patojeninden "yenilenme serumu" geliştirilir. Deneyler başarısız olur, sızıntı su şebekesine karışır.
// Hükümet örtbas eder; ordu 30. günde adayı "Son Işık" operasyonuyla (kızıl sis + sterilizasyon) kapatacaktır.

export const NOTES = {
  broadcast_day1: { title: 'Acil Durum Yayını', src: 'TV / Radyo', text: 'Sağlık Bakanlığı: "Bölgede görülen saldırganlık vakaları kontrol altındadır. Vatandaşlarımızın evlerinden çıkmamaları önerilir. Su şebekesi geçici olarak incelemeye alınmıştır."' },
  camp_diary: { title: 'Kampçının Günlüğü', src: 'Orman Kamp Alanı', text: '3. gün. Göldeki suyu kaynatmadan içen Burak ateşlendi. Gece çadırın etrafında yürüyordu… gözleri kıpkırmızıydı. Ormandaki kızıl mantarlara dokunmayın. Kuzeydeki tesisten gelen beyaz kamyonlar hep aynı yolu kullanıyor.' },
  research_team: { title: 'Saha Notu — Ekip 4', src: 'Orman', text: 'Numune K-7 toplandı. Spor yoğunluğu beklenenin 40 katı. Merkez "Kızılçam" protokolünün durdurulmayacağını bildirdi. Hayvanlarda saldırganlık 6. saatte başlıyor. Not: Kartımı mağaradaki zulaya bıraktım.' },
  soldier_letter: { title: 'Askerin Mektubu', src: 'Orman Yolu', text: 'Annem, eğer bunu okuyorsan dönemedim demektir. Bize "Son Işık" diye bir operasyondan bahsettiler. 30. gün adada kimse kalmayacakmış. Cephanelik anahtarı bende, kimse bulamasın diye yanımda taşıyorum.' },
  cave_stash: { title: 'Mağara Zulası', src: 'Mağara', text: 'Kim bulursa: Tesisin güvenlik kartı hastane başhekiminde. Kasa şifresi bankacının not defterinde. Kızılçam serumu bir tedavi DEĞİL. Bu bir silah.' },
  hospital_evac: { title: 'Tahliye Formu', src: 'Ambulans', text: 'Hasta Sayısı: 214. Tahliye edilen: 31. "Kırmızı kodlu hastalar tesise sevk edilecektir." İmza: Dr. S. Aydın' },
  hospital_records: { title: 'Hastane Kayıtları', src: 'Hastane', text: 'Vaka 001 — Laboratuvar teknisyeni, 34. Isırık yok. Bulaş: kontamine su. Ateş, saldırganlık, ağrıya duyarsızlık. 48 saat sonra kalp atışı yok ama hasta hareket ediyor. Tesise bildirildi. Cevap: "Kayıtları imha edin."' },
  military_orders: { title: 'Gizli Emir — Son Işık', src: 'Askerî Bölge', text: 'GİZLİ. 30. gün 22:00\'de Operasyon Son Işık uygulanacaktır. Kızıl sis tüm alçak bölgeleri kaplayacak. Tahliye: helikopter pisti 20:00 — yalnızca onaylı siviller. Köprü konvoyu 21:00. Telsiz frekansı: 147.30' },
  lab_doc1: { title: 'Proje Kızılçam — Özet', src: 'Laboratuvar', text: 'Amaç: Hücresel yenilenme. Kaynak: Pinus spp. kökenli mantar (K-7). Faz 3 denekleri: %100 yenilenme, %100 bilinç kaybı. Yönetim projeyi "savunma amaçlı" olarak sınıflandırdı.' },
  lab_secret: { title: 'Proje Yöneticisinin Ses Kaydı', src: 'Laboratuvar Ofisi', text: '"Sızıntı bir kaza değildi. Su deposuna bilerek verildi — saha testi. Ordu 30 gün sonra her şeyi silecek. Numuneyi buradan çıkarabilen biri olursa, askerlere götürsün: aşı için tek umut o."' },
  lab_final: { title: 'Numune Etiketi', src: 'Karantina Odası', text: 'K-7 Ana Kültür. Asla oda sıcaklığında bırakmayın. Askerî tahliye ekibine teslim edilirse "öncelikli sivil" statüsü verilir.' },
  cctv: { title: 'Güvenlik Kamerası Kaydı', src: 'Polis Merkezi', text: '[Kayıt 26.09 03:12] Beyaz kamyon şehir su deposuna yanaşıyor. Tulumlu iki kişi depoya bir varil boşaltıyor. Kayıt 03:19\'da kesiliyor.' },
  factory_memo: { title: 'Fabrika Notu', src: 'Fabrika', text: 'Jeneratör yedek parçaları B rafında. Motor parçası arayanlar oto tamirhanesine baksın. — Usta Hüseyin' },
  port_log: { title: 'Liman Kayıt Defteri', src: 'Liman Ofisi', text: 'Tüm sivil teknelerin çıkışı yasaklandı. "Martı" teknesi iskelede: motor arızalı, deposu boş. Deniz haritası balıkçı sandığında.' },
  checkpoint_note: { title: 'Kontrol Noktası Listesi', src: 'Kontrol Kulübesi', text: 'Bölgeye giriş yasak. Telsiz merkezi 147.30 frekansında. Sivillerden numune/künye getirenler kayda alınabilir.' },
  bank_note: { title: 'Bankacının Notu', src: 'Banka', text: 'Kasa şifresi 2032-30. Herkes kaçarken parayı kimse düşünmüyor. Ben de düşünmüyorum. Sadece kızımı bulmak istiyorum.' },
  random_diary: { title: 'Yırtık Günlük Sayfası', src: '—', text: 'Marketteki son su şişesi için iki komşu kavga etti. Kimse kimseye güvenmiyor artık. Geceleri sirenler, sabahları sessizlik.' },
  random_diary2: { title: 'Çocuk Çizimi', src: '—', text: 'Bir aile çizimi: anne, baba, çocuk ve bir köpek. Altında: "Babam dönecek. Söz verdi."' },
  random_diary3: { title: 'Alışveriş Listesi', src: '—', text: 'Su (çok), konserve, pil, ilaç (antibiyotik!), çivi, tahta. Pencereleri kapat. Kapıyı kimseye açma.' },
};
export const RANDOM_NOTES = ['random_diary', 'random_diary2', 'random_diary3', 'hospital_records', 'cctv', 'factory_memo', 'bank_note'];

// ------------------------------------------------------------------ 30 GÜNLÜK TAKVİM
export const CALENDAR = {
  1: { title: 'Salgın Açıklaması', broadcast: 'Hükümet: "Yaşanan olaylar münferittir. Evlerinizde kalın, musluk suyunu içmeyin."', effects: ['tutorial'] },
  2: { title: 'Marketlerde Panik', broadcast: 'Marketlerde uzun kuyruklar. Bazı mağazalar kapandı.', effects: ['market_panic'] },
  3: { title: 'İlk Yağmalamalar', broadcast: 'Polis yağma olaylarına müdahale edemiyor. Bazı evler boşaltıldı.', effects: ['looting'] },
  4: { title: 'Elektrik Kesintileri', broadcast: 'Şebeke çöktü. Geceleri sokak lambaları yanmayacak.', effects: ['power_out'] },
  5: { title: 'İlk Yardım Çağrıları', broadcast: 'Telsizlerde yardım çağrıları duyuluyor…', effects: ['distress_calls'] },
  6: { title: 'Hastane Tahliyesi', broadcast: 'Hastane tahliye edildi. Hastaların bir kısmı geride kaldı.', effects: ['hospital_evac'] },
  7: { title: 'İlk Büyük Sürü', broadcast: 'DİKKAT: Şehirden mahallelere doğru büyük bir kalabalık hareket ediyor!', effects: ['horde:1'] },
  8: { title: 'Askerî Kontrol Noktaları', broadcast: 'Ordu kontrol noktaları kurdu. Askerî bölgeye yaklaşmayın.', effects: ['checkpoints'] },
  9: { title: 'Telsiz Yayınları', broadcast: '[Parazit] …147.30… tekrar ediyorum… tesis… su… bilerek…', effects: ['radio_mystery'] },
  10: { title: 'Tahliye Duyurusu', broadcast: 'Son gün tahliyesi planlanıyor. Helikopter pisti ve köprü konvoyu — yalnızca kayıtlı siviller.', effects: ['evac_announce'] },
  11: { title: 'Benzin Sıkıntısı', broadcast: 'Yakıt dağıtımı durduruldu. Pompalar ancak jeneratörle çalışır.', effects: ['fuel_shortage'] },
  12: { title: 'Şehir Merkezinde Çatışmalar', broadcast: 'Şehir merkezinde silah sesleri. Yağmacı grupları ortaya çıktı.', effects: ['city_clashes'] },
  13: { title: 'Yeni Enfekte Türleri', broadcast: 'Gözlem: Bazı enfekteler koşuyor, bazıları geceleri parlıyor!', effects: ['new_types'] },
  14: { title: 'İletişim Ağları Çöktü', broadcast: 'Mobil şebeke kapandı. Takım içi konum takibi için telsiz gerekecek.', effects: ['comms_down'] },
  15: { title: 'Büyük Fırtına', broadcast: 'Meteoroloji: Bu gece şiddetli fırtına bekleniyor.', effects: ['storm'] },
  16: { title: 'Yağmacı Saldırıları', broadcast: 'Silahlı gruplar evlere saldırıyor. Üssünüzü koruyun!', effects: ['raider_attack'] },
  17: { title: 'Gizemli Araştırma Belgeleri', broadcast: 'Sızdırılan belgeler: "Proje Kızılçam" adlı bir araştırmadan bahsediliyor.', effects: ['lab_reveal'] },
  18: { title: 'Askerî Tesisin Keşfi', broadcast: 'Askerî bölgedeki birlikler geri çekildi. Tesis kısmen boş.', effects: ['military_open'] },
  19: { title: 'Su Kaynaklarında Sorun', broadcast: 'Tüm musluk ve göl suları kontamine. Filtre ya da kaynatma şart.', effects: ['water_crisis'] },
  20: { title: 'Büyük Şehirler Boşaltıldı', broadcast: 'Şehir merkezi tamamen düştü. Binlerce enfekte sokakta.', effects: ['city_fall'] },
  21: { title: 'Hava Kötüleşiyor', broadcast: 'Sıcaklıklar düşüyor. Isınma önlemleri alın.', effects: ['cold'] },
  22: { title: 'Yardım Çağrıları Kesildi', broadcast: '…', effects: ['silence'] },
  23: { title: 'Büyük Göç', broadcast: 'Hayatta kalanlar kuzeydeki köprüye doğru yürüyor.', effects: ['migration'] },
  24: { title: 'Güvenli Bölgeler Kapandı', broadcast: 'Askerî güvenli bölgeler yeni sivil kabul etmiyor.', effects: ['safezones_closed'] },
  25: { title: 'Son Tahliye Fırsatları', broadcast: 'Tahliye listesi kapanmak üzere. 147.30 frekansından kayıt olun.', effects: ['last_chance'] },
  26: { title: 'Dev Sürü Hareketi', broadcast: 'Uydular adanın doğusunda dev bir sürü tespit etti!', effects: ['horde:2'] },
  27: { title: 'Sığınakların Hazırlanması', broadcast: 'Son üç gün. Sığınaklarınızı hazırlayın.', effects: ['prep'] },
  28: { title: 'Son Kaynak Toplama', broadcast: 'Gökyüzü kızıla dönüyor. Rüzgâr yön değiştirdi.', effects: ['doom:1'] },
  29: { title: 'Büyük Felaket Yaklaşıyor', broadcast: 'Yarın gece 22:00. Operasyon Son Işık. Tanrı yardımcımız olsun.', effects: ['doom:2', 'horde:2'] },
  30: { title: 'FİNAL — Son Işık', broadcast: 'BU BİR TATBİKAT DEĞİLDİR. 22:00\'de kızıl sis inecek. Tahliye noktalarına gidin!', effects: ['final'] },
};

// ------------------------------------------------------------------ NPC'ler
export const NPCS = {
  hasan: { id: 'hasan', name: 'Hasan Amca', role: 'Komşu', base: 'male', look: { base: 'male', skin: '#e0a07a', hairStyle: 'short', hairColor: '#b0b0b0', beard: 'mustache', hat: 'none', top: { style: 'longsleeve', color: '#7a5c3a' }, pants: { style: 'jeans', color: '#3a3a3a' }, shoes: '#2c2c2c', backpack: 'none', glasses: 'square', build: 1.02, dirt: 0.1 }, home: 'n1', faction: 'neighbors',
    greet: ['Evladım, dikkatli olun. Bu işin sonu hiç iyi değil.', 'Benim zamanımda böyle şeyler olmazdı…'], trade: true },
  ayse: { id: 'ayse', name: 'Ayşe Teyze', role: 'Komşu', look: { base: 'survivor-female', skin: '#f6d0b1', hairStyle: 'bun', hairColor: '#8a8a8a', beard: 'none', hat: 'none', top: { style: 'flannel', color: '#8e44ad', color2: '#5b2c6f' }, pants: { style: 'sweat', color: '#34495e' }, shoes: '#ecf0f1', backpack: 'none', glasses: 'round', build: 0.96, dirt: 0.05 }, home: 's3', faction: 'neighbors',
    greet: ['Torunum Can kayboldu, görürseniz bana getirin!', 'Size börek yapardım ama un kalmadı yavrum.'] },
  can: { id: 'can', name: 'Küçük Can', role: 'Çocuk', look: { base: 'skater-male', skin: '#efb994', hairStyle: 'messy', hairColor: '#6b4226', beard: 'none', hat: 'capBack', hatColor: '#e74c3c', top: { style: 'tshirt', color: '#27ae60' }, pants: { style: 'shorts', color: '#2980b9' }, shoes: '#f1c40f', backpack: 'small', backpackColor: '#e67e22', build: 0.8, height: 0.72, dirt: 0.3 }, faction: 'neighbors',
    greet: ['Abla/abi… çok korkuyorum.', 'Köpeğim Karabaş da kayboldu…'] },
  riza: { id: 'riza', name: 'Tüccar Rıza', role: 'Gezgin Tüccar', look: { base: 'skater-male', skin: '#c98a5e', hairStyle: 'short', hairColor: '#1d1410', beard: 'goatee', hat: 'cowboy', hatColor: '#6b4f2a', top: { style: 'vest', color: '#6b4f2a', color2: '#c0392b' }, pants: { style: 'cargo', color: '#4a4036' }, shoes: '#3b2b1d', backpack: 'hiking', backpackColor: '#8a5a2b', accessory: 'bandolier', build: 1.0, dirt: 0.4 }, faction: 'traders',
    greet: ['Her şeyin bir fiyatı var dostum. Kıyamette bile.', 'Bugün mallar taze! Yani… çok bozuk değil.'], trade: true },
  kemal: { id: 'kemal', name: 'Çavuş Kemal', role: 'Asker', look: { base: 'survivor-male', skin: '#e0a07a', hairStyle: 'short', hairColor: '#1d1410', beard: 'stubble', hat: 'helmet', hatColor: '#4b5320', top: { style: 'uniform', color: '#556b2f', color2: '#3a4a2a' }, pants: { style: 'camo', color: '#556b2f' }, shoes: '#2c2c2c', backpack: 'tactical', backpackColor: '#4b5320', gloves: 'tactical', accessory: 'radio', build: 1.08, dirt: 0.3 }, faction: 'military',
    greet: ['Sivil! Bölge yasak. …Ama yardıma ihtiyacımız var.', 'Künye getirirsen listeye yazarım. Söz.'] },
  selin: { id: 'selin', name: 'Dr. Selin Aydın', role: 'Bilim İnsanı', look: { base: 'survivor-female', skin: '#efb994', hairStyle: 'long', hairColor: '#2c1a10', beard: 'none', hat: 'none', top: { style: 'coat', color: '#ecf0f1', color2: '#2c3e50' }, pants: { style: 'jeans', color: '#2c3e50' }, shoes: '#2c2c2c', backpack: 'none', glasses: 'square', build: 0.95, dirt: 0.5 }, faction: 'neighbors',
    greet: ['Ben… o tesiste çalışıyordum. Hepsi benim suçum.', 'Numuneyi askerlere ulaştırmalıyız. Tek şans bu.'] },
  kurt: { id: 'kurt', name: '"Kurt"', role: 'Yağmacı Lideri', look: { base: 'male', skin: '#c98a5e', hairStyle: 'mohawk', hairColor: '#c0392b', beard: 'stubble', hat: 'bandana', hatColor: '#1b1b1b', top: { style: 'vest', color: '#1b1b1b', color2: '#7a2020' }, pants: { style: 'cargo', color: '#2c2c2c' }, shoes: '#1b1b1b', backpack: 'tactical', backpackColor: '#1b1b1b', glasses: 'sunglasses', gloves: 'tactical', accessory: 'bandolier', build: 1.1, dirt: 0.6 }, faction: 'raiders',
    greet: ['Güzel bir üssünüz var. Yazık olur.', 'Yarısını verin, gerisi sizde kalsın. Adil, değil mi?'] },
};

// ------------------------------------------------------------------ GÖREVLER
// obj türleri: collect, deliver, goto, kill, build, craft, interact, flag, survive, talk, repair, search
export const QUESTS = {
  // ---- ana hikâye
  m1_home: { kind: 'main', title: 'Evimiz, Kalemiz', desc: 'Evde neler olduğuna bak. Dolapları araştır ve garajdaki eski arabayı kontrol et.', objs: [{ t: 'search', building: 'home', count: 4, label: 'Evdeki dolapları ara' }, { t: 'interact', target: 'generator', label: 'Bahçedeki jeneratörü incele' }], reward: [['canned_food', 2], ['water_bottle', 2]], next: ['m2_supplies'] },
  m2_supplies: { kind: 'main', title: 'Marketi Ara', desc: 'Kuyruklar uzamadan mahalle marketinden erzak topla.', objs: [{ t: 'collect', item: 'canned_food', count: 5, label: 'Konserve bul', alt: ['canned_beans'] }, { t: 'collect', item: 'water_bottle', count: 3, label: 'Su bul' }], reward: [['chocolate', 2]], next: ['m3_defense'], waypoint: 'market' },
  m3_defense: { kind: 'main', title: 'İlk Savunma', desc: 'Geceleri zombiler daha aktif. Evin pencerelerini güçlendir ve bir barikat kur.', objs: [{ t: 'flag', flag: 'window_boarded', count: 2, label: 'Pencere güçlendir (2)' }, { t: 'build', item: 'barricade_wood', count: 1, label: 'Tahta barikat kur' }], reward: [['nails', 20], ['plank', 4]], next: ['m4_generator'] },
  m4_generator: { kind: 'main', title: 'Işıklar Yansın', desc: 'Elektrik kesilmeden jeneratörü onar. Motor parçası oto tamircisinde ya da garajlarda olabilir.', objs: [{ t: 'collect', item: 'engine_part', count: 1, label: 'Motor parçası bul' }, { t: 'collect', item: 'electronics', count: 2, label: 'Elektronik parça bul' }, { t: 'repair', target: 'generator', label: 'Jeneratörü onar' }], reward: [['jerrycan', 1, { fuel: 10 }]], next: ['m5_horde'] },
  m5_horde: { kind: 'main', title: 'Sürüye Hazırlan', desc: '7. gün büyük bir sürü bekleniyor. Üs savunmanı 15 puana çıkar ve geceyi atlat.', objs: [{ t: 'flag', flag: 'base_def', count: 15, label: 'Üs savunması 15' }, { t: 'survive', day: 8, label: '7. günün gecesini atlat' }], reward: [['first_aid', 1], ['ammo_9mm', 12]], next: ['m6_radio'] },
  m6_radio: { kind: 'main', title: 'Parazitli Frekans', desc: 'Telsizde garip yayınlar var. Bir telsiz üret ya da bul ve 147.30 frekansını dinle.', objs: [{ t: 'collect', item: 'radio', count: 1, label: 'Telsiz edin' }, { t: 'flag', flag: 'radio_heard', count: 1, label: 'Telsizi kullan (envanterde Kullan)' }], reward: [['battery', 4]], next: ['m7_hospital'] },
  m7_hospital: { kind: 'main', title: 'Hastane Kayıtları', desc: 'Salgının nasıl başladığını öğren. Hastanedeki başhekim odasını araştır.', objs: [{ t: 'goto', poi: 'hospital', r: 30, label: 'Hastaneye git' }, { t: 'flag', flag: 'note:hospital_records', count: 1, label: 'Hastane kayıtlarını bul' }], reward: [['antibiotics', 2]], next: ['m8_lab'] },
  m8_lab: { kind: 'main', title: 'Proje Kızılçam', desc: 'Tesise girmek için güvenlik kartı lazım. Kart başhekimde, mağaradaki zulada ya da bir kasada olabilir.', objs: [{ t: 'collect', item: 'keycard', count: 1, label: 'Güvenlik kartı bul' }, { t: 'goto', poi: 'lab', r: 25, label: 'Araştırma tesisine gir' }, { t: 'flag', flag: 'note:lab_secret', count: 1, label: 'Proje yöneticisinin kaydını bul' }], reward: [['ammo_rifle', 10]], next: ['m9_escape'], unlockDay: 10 },
  m9_escape: { kind: 'main', title: 'Kaçış Planı', desc: 'Son Işık 30. gün 22:00\'de. Bir kaçış yolu seç ve hazırlıklarını tamamla (Finaller: Görevler > Kaçış Planları).', objs: [{ t: 'flag', flag: 'ending_ready', count: 1, label: 'En az bir kaçış planını hazır hale getir' }], reward: [], next: [] },
  // ---- yan görevler
  s_hasan_meds: { kind: 'side', title: 'Hasan Amca\'nın İlacı', giver: 'hasan', desc: 'Hasan Amca\'nın tansiyon ilacı bitti. Eczaneden ya da hastaneden ilaç getir.', objs: [{ t: 'deliver', item: 'antibiotics', count: 1, to: 'hasan', label: 'İlaç kutusunu Hasan Amca\'ya götür', alt: ['painkiller'] }], reward: [['shotgun', 1], ['shells', 6]], rel: ['neighbors', 15] },
  s_ayse_can: { kind: 'side', title: 'Kayıp Torun', giver: 'ayse', desc: 'Ayşe Teyze\'nin torunu Can parkta kaybolmuş. Onu bul ve eve getir.', objs: [{ t: 'talk', npc: 'can', label: 'Can\'ı bul' }, { t: 'flag', flag: 'can_home', count: 1, label: 'Can\'ı Ayşe Teyze\'ye götür' }], reward: [['stew', 2], ['cookie', 4]], rel: ['neighbors', 20], morale: 15 },
  s_can_dog: { kind: 'side', title: 'Karabaş', giver: 'can', desc: 'Can\'ın köpeği Karabaş ormana kaçmış. Onu bul — belki üssünüzde kalmak ister.', objs: [{ t: 'flag', flag: 'dog_found', count: 1, label: 'Karabaş\'ı bul (Orman kenarı)' }], reward: [], morale: 20 },
  s_kemal_tags: { kind: 'side', title: 'Künyeler', giver: 'kemal', desc: 'Çavuş Kemal düşen arkadaşlarının künyelerini istiyor.', objs: [{ t: 'deliver', item: 'medal', count: 3, to: 'kemal', label: '3 künye götür' }], reward: [['mre', 3], ['ammo_9mm', 20]], rel: ['military', 30] },
  s_kemal_sample: { kind: 'side', title: 'Aşı İçin Umut', giver: 'selin', desc: 'Laboratuvardaki virüs numunesini askerlere ulaştır. Tahliye listesine girmenin en kesin yolu.', objs: [{ t: 'collect', item: 'lab_sample', count: 1, label: 'Numuneyi al (Karantina Odası)' }, { t: 'deliver', item: 'lab_sample', count: 1, to: 'kemal', label: 'Çavuş Kemal\'e teslim et' }], reward: [['smg', 1], ['ammo_9mm', 30]], rel: ['military', 60] },
  s_riza_fuel: { kind: 'side', title: 'Tüccarın Siparişi', giver: 'riza', desc: 'Rıza, kamyoneti için 20 litre yakıt istiyor. Karşılığında iyi para ve malzeme veriyor.', objs: [{ t: 'flag', flag: 'riza_fuel', count: 1, label: 'Dolu bir yakıt bidonu ver' }], reward: [['money', 300], ['car_battery', 1], ['engine_part', 1]], rel: ['traders', 25] },
  s_boat: { kind: 'side', title: 'Martı Teknesi', desc: 'Limandaki "Martı" teknesini tamir et, yakıtını doldur ve deniz haritasını bul.', objs: [{ t: 'repair', target: 'vehicle:boat', label: 'Tekneyi onar' }, { t: 'flag', flag: 'boat_fuel', count: 40, label: 'Tekneye 40 L yakıt koy' }, { t: 'collect', item: 'sea_map', count: 1, label: 'Deniz haritası bul' }], reward: [], ending: 'sea' },
  s_mountain: { kind: 'side', title: 'Dağdaki Sığınak', desc: 'Dağ kampına erzak taşı: kızıl sis yükseklere çıkamaz.', objs: [{ t: 'flag', flag: 'mountain_food', count: 20, label: 'Kampa 20 yiyecek/içecek bırak' }, { t: 'flag', flag: 'mountain_cabin', count: 1, label: 'Kulübe kapısını güçlendir' }], reward: [], ending: 'mountain' },
  s_bunker: { kind: 'side', title: 'Yeraltı Sığınağı', desc: 'Bahçedeki bodrum kapağından başlayarak 4 aşamalı sığınağı inşa et.', objs: [{ t: 'flag', flag: 'bunker_stage', count: 4, label: 'Sığınak aşamaları' }], reward: [], ending: 'bunker' },
  s_antenna: { kind: 'side', title: 'Frekans 147.30', desc: 'Askerî tahliye listesine girmek için üsse telsiz anteni kur ve askerlerle ilişkini geliştir.', objs: [{ t: 'build', item: 'antenna', count: 1, label: 'Telsiz anteni kur' }, { t: 'flag', flag: 'rel:military', count: 50, label: 'Askerî ilişki 50' }], reward: [], ending: 'military' },
  s_convoy: { kind: 'side', title: 'Köprü Konvoyu', desc: 'Sağlam, zırhlı ve deposu dolu bir araçla 30. gün 21:00\'de kuzeydoğudaki köprüden geç.', objs: [{ t: 'flag', flag: 'vehicle_ready', count: 1, label: 'Bir aracı hazırla (%60 sağlık, %70 yakıt, zırh)' }], reward: [], ending: 'convoy' },
};

// ------------------------------------------------------------------ RASTGELE OLAYLAR (20)
// Her olay: başlık, metin, görsel, koşul (gece/gün, gün aralığı), sahne (oyun içi kurulum) ve seçenekler.
export const EVENTS = {
  injured_kid: { title: 'Gece Kapı Çalınıyor', img: 'injured', text: 'Kapıda yaralı bir çocuk ve babası var. Baba, "Lütfen, sadece bir gece!" diye yalvarıyor. Kolundaki yara ısırığa benzemiyor… ama emin olamıyorsun.', night: true, minDay: 2, scene: 'npc_at_door',
    choices: [
      { text: 'İçeri al, yarasını sar (1 bandaj)', cost: [['bandage', 1]], effects: { morale: 10, rel: ['neighbors', 15], reward: [['note', 1], ['canned_food', 3]] }, result: 'Sabah teşekkür edip yollarına devam ettiler. Geride bir torba erzak bıraktılar.' },
      { text: 'Biraz yiyecek ver, ama içeri alma', cost: [['canned_food', 1]], effects: { morale: 3, rel: ['neighbors', 5] }, result: 'Yiyeceği alıp karanlığa karıştılar.' },
      { text: 'Kapıyı açma', effects: { morale: -8 }, result: 'Ayak sesleri uzaklaştı. Bu gece kimse uyuyamadı.' },
    ] },
  generator_broken: { title: 'Jeneratör Arızası', img: 'generator', text: 'Jeneratör öksürüp sustu! Işıklar söndü, kameralar karardı.', minDay: 4, requires: 'generator_fixed', scene: 'generator_break',
    choices: [
      { text: 'Hemen tamir et (tamir seti)', cost: [['repair_kit', 1]], effects: { fixGenerator: true }, result: 'Mert usulü bir tekme ve biraz bant. Çalıştı!' },
      { text: 'Sabahı bekle', effects: { morale: -4, generatorOffHours: 8 }, result: 'Gece karanlıkta geçecek.' },
    ] },
  horde_near: { title: 'Sürü Yaklaşıyor', img: 'horde', text: 'Gözcü uyarıyor: üssün yakınında 15-20 zombilik bir grup var ve bu tarafa geliyor!', minDay: 3, scene: 'spawn_horde',
    choices: [
      { text: 'Savunma pozisyonu al!', effects: { horde: 18 }, result: 'Sürü kapıya dayandı. Silahlarınızı hazırlayın!' },
      { text: 'Ses bombasıyla uzağa çek', cost: [['smoke_bomb', 1]], effects: { horde: 6 }, result: 'Sürünün çoğu gürültüye yöneldi. Sadece birkaç tanesi geliyor.' },
    ] },
  distress_call: { title: 'Telsizden Yardım Çağrısı', img: 'radio', text: '"Burası… Benzinlik marketi. Mahsur kaldık, dışarıda düzinelerce var. Yardım edin!"', minDay: 5, maxDay: 22, scene: 'distress',
    choices: [
      { text: 'Yardıma git (görev)', effects: { quest: 'q_distress' }, result: 'Benzinliğe git ve hayatta kalanları kurtar.' },
      { text: 'Çok riskli', effects: { morale: -5 }, result: 'Telsiz bir süre sonra sustu.' },
    ] },
  trapped_teammate: { title: 'Mahsur Kalan Arkadaş', img: 'horde', text: 'Bir takım arkadaşın markette mahsur kaldı! Kapıyı zombiler sardı.', minDay: 4, mp: true, scene: 'trap_player',
    choices: [{ text: 'Hemen gidiyoruz!', effects: { horde_at_player: 10 }, result: 'Koşun!' }] },
  car_theft: { title: 'Araç Hırsızları', img: 'raiders', text: 'Garajda tıkırtılar! Yağmacılar arabanızı çalmaya çalışıyor.', minDay: 6, scene: 'raiders_car',
    choices: [
      { text: 'Onlarla yüzleş', effects: { raiders: 3 }, result: 'Silahlarını çektiler!' },
      { text: 'Pazarlık et (50 para)', cost: [['money', 50]], effects: { rel: ['raiders', 10] }, result: '"Akıllıca seçim." Gittiler… şimdilik.' },
    ] },
  storm: { title: 'Şiddetli Fırtına', img: 'convoy', text: 'Gökyüzü karardı, rüzgâr ağaçları büküyor. Dışarıda kalmak tehlikeli: görüş düşük, soğuk artıyor.', minDay: 2, scene: 'storm',
    choices: [{ text: 'İçeride kal ve bekle', effects: { weather: 'storm' }, result: 'Fırtına birkaç saat sürecek.' }] },
  power_fail: { title: 'Elektrik Sistemi Çöktü', img: 'generator', text: 'Kablolar kısa devre yaptı. Tüm elektrikli savunmalar devre dışı!', minDay: 6, requires: 'generator_fixed', scene: 'power_fail',
    choices: [
      { text: 'Kabloları değiştir (2 kablo)', cost: [['wire', 2]], effects: { fixPower: true }, result: 'Sistem yeniden çalışıyor.' },
      { text: 'Şimdilik idare et', effects: { powerOffHours: 12 }, result: 'Gece karanlık geçecek.' },
    ] },
  trader_visit: { title: 'Tüccar Geldi', img: 'convoy', text: 'Tüccar Rıza kamyonetiyle üssün önünde! Takas için iyi mallar getirmiş.', minDay: 2, scene: 'trader',
    choices: [{ text: 'Takas yap', effects: { trade: 'riza' }, result: 'Rıza tezgâhını açtı.' }, { text: 'İlgilenmiyoruz', effects: {}, result: 'Rıza omuz silkip gitti.' }] },
  gas_explosion: { title: 'Benzinlikte Patlama!', img: 'convoy', text: 'Uzaktan büyük bir patlama sesi! Benzin istasyonu alev aldı. Ses bütün zombileri oraya çekiyor…', minDay: 8, scene: 'gas_explosion',
    choices: [{ text: 'Fırsat: zombiler oraya giderken başka yeri yağmala', effects: { noise: 'gas' }, result: 'Şehir merkezi bir süre daha sakin olacak.' }] },
  lost_camp: { title: 'Kayıp Kamp', img: 'convoy', text: 'Ormanda terk edilmiş bir kamp keşfedildi. Çadırlarda malzeme olabilir.', minDay: 3, scene: 'lost_camp',
    choices: [{ text: 'Haritaya işaretle', effects: { marker: 'lost_camp', loot: 'lost_camp' }, result: 'Kamp haritaya eklendi.' }] },
  alarm_accident: { title: 'Kazara Alarm!', img: 'horde', text: 'Birisi (kimse itiraf etmiyor) bir arabanın alarmını çalıştırdı! Her yerden inleme sesleri…', minDay: 2, scene: 'alarm',
    choices: [{ text: 'Kaçııın!', effects: { noise: 'player', morale: -2 }, result: 'Gürültü zombileri çekiyor!' }] },
  old_soldier: { title: 'Eski Asker', img: 'raiders', text: 'Yaşlı bir emekli asker yanınıza geldi: "Askerî bölgenin arka kapısını bilirim. Cephanelik anahtarı orman yolundaki ölü bir askerdeydi."', minDay: 6, scene: 'npc_visit',
    choices: [{ text: 'Dinle ve teşekkür et', effects: { marker: 'soldier_body', rel: ['military', 5] }, result: 'Asker cesedinin yeri haritaya işaretlendi.' }] },
  animal_in_base: { title: 'Üste Bir Hayvan', img: 'convoy', text: 'Bahçeden hırıltı sesleri… Bir tilki tavuk kümesine… pardon, erzak sandığına dalmış!', minDay: 2, scene: 'animal',
    choices: [{ text: 'Kovala!', effects: { loseFood: 2, morale: 2 }, result: 'Tilki iki konserveyle kaçtı. Yine de güldünüz.' }] },
  poison_food: { title: 'Bozuk Yiyecek', img: 'generator', text: 'Depodaki bazı yiyecekler küflenmiş. Biri çoktan yemiş bile…', minDay: 5, scene: 'poison',
    choices: [{ text: 'Kömür tableti ver', cost: [['charcoal', 1]], effects: {}, result: 'Zehirlenme atlatıldı.' }, { text: 'Geçer…', effects: { poisonRandom: true }, result: 'Birinin midesi bulanıyor.' }] },
  research_traces: { title: 'Araştırma Ekibinin İzleri', img: 'convoy', text: 'Ormanda beyaz tulumlu insanların ayak izleri ve bir çanta görüldü.', minDay: 9, scene: 'research',
    choices: [{ text: 'Haritaya işaretle', effects: { marker: 'research_trace' }, result: 'Çantanın yeri haritada.' }] },
  car_breakdown: { title: 'Yolda Arıza', img: 'convoy', text: 'Aracın motorundan duman çıkıyor! Bir yerde durup bakman lazım.', minDay: 3, requires: 'driving', scene: 'car_breakdown',
    choices: [{ text: 'Tamam, kenara çek', effects: { carDamage: 0.25 }, result: 'Araç hasar aldı. Tamir seti işe yarar.' }] },
  migration: { title: 'Göç Eden Grup', img: 'raiders', text: 'Şehirden kaçan kalabalık bir grup mahalleden geçiyor. Liderleri yemek karşılığında bilgi veriyor.', minDay: 10, scene: 'migration',
    choices: [
      { text: 'Yiyecek ver (3 konserve)', cost: [['canned_food', 3]], effects: { rel: ['neighbors', 15], marker: 'cave_stash', morale: 6 }, result: '"Mağarada bir zula var, kart orada." Haritaya işaretlendi.' },
      { text: 'Uzak dur', effects: {}, result: 'Grup kuzeye, köprüye doğru yürüdü.' },
    ] },
  survivors_help: { title: 'Yardım İsteyen Hayatta Kalanlar', img: 'injured', text: 'İki hayatta kalan üssünüze sığınmak istiyor. Biri marangoz, biri hemşire.', minDay: 7, scene: 'npc_at_door',
    choices: [
      { text: 'Kabul et (üs savunmasına yardım ederler)', effects: { allies: 2, morale: 8, foodUpkeep: true }, result: 'Yeni yüzler, yeni umutlar. Ama daha fazla ağız doyurmak gerek.' },
      { text: 'Malzeme verip uğurla', cost: [['water_bottle', 2]], effects: { morale: 2 }, result: 'Teşekkür edip gittiler.' },
    ] },
  security_fail: { title: 'Güvenlik Sistemi Arızası', img: 'generator', text: 'Kameralar ve alarmlar bir anda sustu. Bir şey kabloları kemiriyor…', minDay: 8, requires: 'has_security', scene: 'power_fail',
    choices: [{ text: 'Kontrol et', effects: { fixPower: true, spawnNear: 3 }, result: 'Kablolarda bir zombi sıçanı! …Şaka. Ama 3 zombi vardı.' }] },
};

// ------------------------------------------------------------------ FİNALLER
export const ENDINGS = {
  bunker: { name: 'Yeraltı Sığınağı', icon: '🛡️', desc: 'Kapakları kapat, sığınağa in ve kızıl sisin geçmesini bekle.', req: 'Sığınak (4 aşama) tamamlanmış, jeneratör çalışıyor, depoda 15+ yiyecek ve su.' },
  military: { name: 'Askerî Tahliye', icon: '🚁', desc: 'Helikopter pistine 20:00\'de ulaş. Listede adın varsa helikoptere bin.', req: 'Telsiz anteni + askerî ilişki 50+. 30. gün 20:00 helikopter pisti.' },
  sea: { name: 'Deniz Yoluyla Kaçış', icon: '⛵', desc: 'Martı teknesiyle denize açıl.', req: 'Tekne onarılmış, 40 L yakıt, deniz haritası.' },
  mountain: { name: 'Dağlara Kaçış', icon: '⛰️', desc: 'Sis yükseklere çıkamaz. Dağ kampında yeni bir hayat.', req: 'Kampa 20 erzak + kulübe güçlendirilmiş. 22:00\'den önce kampa ulaş.' },
  convoy: { name: 'Araçla Kaçış (Köprü)', icon: '🚙', desc: 'Son konvoyla köprüden anakaraya geç.', req: 'Araç: %60+ sağlık, %70+ yakıt, zırh kiti. 30. gün 21:00 köprü.' },
  defense: { name: 'Son Savunma', icon: '🔥', desc: 'Üssünü savun. Şafak sökene kadar dayan.', req: 'Her zaman mümkün. Başarı üs savunmasına bağlı.' },
};
