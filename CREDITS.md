# Krediler ve Lisanslar

## Oyun
- **KIYAMETTEN ÖNCE** — oyun tasarımı, programlama, dünya, sistemler ve arayüz: proje sahibi
  (`adnanerdem2000-sudo`) için Claude Code ile geliştirildi.
- Konsept görseller (`assets/img/keyart.jpg`, karakter portreleri, ilk olay görselleri, harita konsepti):
  proje sahibinin sağladığı tanıtım kolajlarından kırpıldı.
- Yeni olay kartı görselleri (`airdrop, crash, wolves, bloodmoon, fog, farm, prison, lighthouse, dam`):
  oyunun kendi sahnelerinden `tools/event-art.mjs` ile çizildi.

## Üçüncü taraf varlıklar (hepsi ücretsiz)

| Varlık | Kaynak | Lisans |
|---|---|---|
| Karakter modelleri (survivor/skater/cyborg), araçlar, evler, yiyecek ve eşya modelleri, ağaçlar | Kenney (kenney.nl) — pmndrs market üzerinden | CC0 1.0 |
| Kamyon/motosiklet modelleri, şehir parçaları, ses efektleri (`assets/audio/*.ogg`) | Kenney Starter Kits (Racing, City Builder) | CC0 1.0 (varlıklar) |
| Mobilya, mutfak, Cadılar Bayramı/prototip parçaları, şehir binaları, zindan parçaları, macera karakterleri | KayKit — Kay Lousberg (kaylousberg.com) | CC0 1.0 |
| Eski karavan (Citroen), kütüphane, rüzgâr türbini | Creative Trio — pmndrs market | CC0 1.0 |
| Bank | Sara Vieira — pmndrs market | CC0 1.0 |
| Köpek modeli | Reuben Sotomayor & Alejandro León — pmndrs market | CC0 1.0 |
| Luckiest Guy yazı tipi | Astigmatic (Google Fonts / Fontsource) | Apache 2.0 (`assets/fonts/LuckiestGuy-LICENSE.txt`) |
| Rubik, Rubik Dirt yazı tipleri | Hubert & Fischer (Google Fonts / Fontsource) | SIL Open Font License 1.1 |
| İskeletli insan modelleri (Adventurer, Hooded Adventurer) ve hayvanlar (kurt, geyik, erkek geyik, husky, tilki, shiba) | Quaternius (quaternius.com) — `@netforge/asset-library-files` paketi üzerinden (meshopt ile optimize) | CC0 1.0 |
| Ayak sesi, acı, takla, yere düşme ve kalkma ses efektleri (`step_hard, hurt, whoosh, downed, revive`) | Kenney ses paketleri (Impact Sounds, RPG Audio, Interface Sounds) — aynı paket üzerinden | CC0 1.0 |
| "Battle Theme A" müziği (`assets/audio/music/battle_theme_a.mp3`) | cynicmusic / The Cynic Project — OpenGameArt | CC0 1.0 |
| three.js r187 | mrdoob & katkıda bulunanlar | MIT (`vendor/three/LICENSE`) |
| PeerJS 1.5.5 | PeerJS ekibi | MIT (`vendor/peerjs.LICENSE`) |
| Rapier 3D (rapier3d-compat) fizik motoru | Dimforge | Apache 2.0 (`vendor/rapier/LICENSE`) |
| meshoptimizer çözücü | Arseny Kapoulkine | MIT (`vendor/meshopt/LICENSE.md`) |

Sakin/keşif/tehlike müziği ile silah, zombi, hava, ayak (zemine göre) sesleri Web Audio ile prosedürel
olarak üretilir; çatışmada CC0 savaş teması devreye girer.
Dokular (ahşap kaplama, tuğla, beton, kiremit…) çalışma anında canvas ile üretilir.

CC0 varlıklar için atıf zorunlu değildir; yine de emekleri için teşekkür ederiz.
