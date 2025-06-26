# Addon Stremio pentru Subtitrări Românești

Un addon pentru Stremio care oferă subtitrări în limba română de pe subs.ro - cea mai mare comunitate de subtitrări din România.

## ⚠️ Disclaimer Legal

Acest addon funcționează ca un agregator care indexează și direcționează către subtitrări disponibile public pe subs.ro. Addon-ul:
- **NU găzduiește** niciun conținut pe serverele proprii
- **NU încărcază** și nu stochează permanent subtitrări
- **Respectă** rate limiting și best practices pentru web scraping
- Funcționează similar cu un motor de căutare specializat

Utilizatorii sunt responsabili pentru respectarea legilor aplicabile în jurisdicția lor. Dezvoltatorii nu își asumă responsabilitatea pentru utilizarea neautorizată a conținutului.

## Instalare

### Cerințe sistem
- Node.js 14.0.0 sau mai nou
- npm sau yarn

### Instalare locală
```bash
# Clonează repository-ul
git clone https://github.com/username/subsro-stremio-addon.git
cd subsro-stremio-addon

# Instalează dependențele
npm install

# Pornește serverul
npm start

# Addon-ul va fi disponibil la:
# http://localhost:7000/manifest.json
```

### Instalare în Stremio

1. Deschide Stremio
2. Navighează la secțiunea Addon-uri
3. Click pe "Community Addons" sau "Configure Addons"
4. Adaugă URL-ul addon-ului tău:
   ```
   http://localhost:7000/manifest.json
   ```

## Configurare

### Variabile de mediu

Copiază `.env.example` în `.env` și configurează:

```bash
# Server
PORT=7000
NODE_ENV=production

# URL Public (OBLIGATORIU pentru producție)
PUBLIC_URL=https://addon.example.com

# Feature Flags
DISABLE_PROXIES=true
ENABLE_CACHE=true

# Limite Cleanup
LOG_RETENTION_HOURS=48
TEMP_FILE_RETENTION_HOURS=48
CACHE_DURATION_HOURS=720

# Scraping Protection
SCRAPING_DELAY_MS=1500
USER_AGENT=Mozilla/5.0 (Compatible; StremioAddon/1.0)

# Stream Download
ENABLE_STREAM_DOWNLOAD=true
```

## Cum funcționează

1. **Stremio solicită subtitrări** → Trimite ID-ul IMDB și numele fișierului video
2. **Addon-ul caută pe subs.ro** → Extrage lista de subtitrări pentru filmul/serialul respectiv
3. **Descarcă arhivele** → Preia fișierele ZIP/RAR care conțin subtitrările
4. **Extrage și procesează** → Dezarhivează și detectează codificarea textului
5. **Sortare inteligentă** → Ordonează subtitrările după compatibilitatea cu video-ul tău
6. **Servește către Stremio** → Returnează URL-urile formatate corect

### Potrivire după calitate

Addon-ul sortează inteligent subtitrările bazându-se pe fișierul tău video:
- Potrivirile exacte de nume apar primele
- Tag-urile de calitate identice (BluRay, WEB-DL, etc.) sunt prioritizate
- Maximum 15 subtitrări per tip de calitate pentru a evita aglomerarea

### Tag-uri de calitate suportate

`REMUX`, `BluRay`, `BRRip`, `BDRip`, `WEB-DL`, `WEBRip`, `HDTV`, `HDRip`, `DVDRip`, și altele

## Structura proiectului

```
subsro-stremio-addon/
│
├── 📄 addon-fixed.js                # Server Express cu rate limiting și SDK Stremio
├── 📄 package.json                  # Dependențe NPM (include express-rate-limit)
├── 📄 test-local.sh                 # Script testare rapidă locală
│
├── 📁 lib/                         # Module principale ale aplicației
│   ├── 📄 subsRoService.js         # Serviciul principal - scraping subs.ro, download, extracție
│   ├── 📄 streamExtractor.js       # Download și extracție cu streaming pentru latență redusă
│   ├── 📄 seriesCache.js           # Sistem de cache pentru episoade seriale (30 zile)
│   ├── 📄 logger.js                # Sistem de logging cu cleanup automat
│   ├── 📄 rarExtractor.js          # Extractor pentru arhive RAR cu subtitrări
│   ├── 📄 episodeExtractor.js      # Parser pentru detectarea episoadelor (S01E01)
│   ├── 📄 proxyRotator.js          # Rotație proxy pentru evitarea rate limiting
│   └── 📄 downloadQueue.js         # Coadă de download cu limite concurente
│
├── 📁 config/                      # Configurații aplicație
│   ├── 📄 features.js              # Feature flags (cache, proxy, preload)
│   └── 📄 proxies.js               # Listă proxy-uri (gol implicit)
│
├── 📁 deployment/                  # Toate fișierele necesare pentru deployment
│   ├── 📁 docker/                  
│   │   ├── 📄 Dockerfile           # Imagine Docker optimizată Node.js 18
│   │   └── 📄 docker-compose.yml   # Stack Docker pentru producție
│   │
│   ├── 📁 hetzner/                 
│   │   ├── 📄 deploy-hetzner.sh    # Script automat deployment Hetzner
│   │   └── 📄 nginx.conf           # Config NGINX cu HTTPS și CORS
│   │
│   └── 📁 systemd/                 
│       ├── 📄 systemd-maintenance.service  # Service pentru curățenie
│       └── 📄 logrotate.d-stremio-addon   # Rotație automată logs
│
├── 📁 cache/                       # Cache runtime (persistent)
│   └── 📁 series/                  # Cache JSON pentru episoade (30 zile)
│
├── 📁 logs/                        # Logs aplicație (auto-cleanup după 48h)
├── 📁 temp/                        # Fișiere temporare SRT (cleanup după 48h)
│
├── 📄 .env.example                 # Template variabile de mediu
├── 📄 README.md                    # Documentație principală (RO)
├── 📄 PROJECT-STRUCTURE.md         # Structura detaliată proiect
└── 📄 CHANGELOG.md                 # Istoric versiuni
```

## Endpoint-uri API

- `GET /manifest.json` - Manifestul addon-ului
- `GET /subtitles/:type/:id.json` - Endpoint căutare subtitrări
- `GET /subtitle/:filename` - Servire fișiere subtitrare
- `GET /health` - Verificare stare server (include status subs.ro)
- `GET /proxy-status` - Status proxy rotation (doar development)

## Deployment

### 🐳 Docker (Recomandat)
```bash
cd deployment/docker
docker-compose up -d
```

### ☁️ Hetzner Cloud
```bash
cd deployment/hetzner
./deploy-hetzner.sh
```

### 🖥️ Manual
```bash
npm install --production
PORT=7000 NODE_ENV=production node addon-fixed.js
```

Pentru detalii complete vezi [DEPLOYMENT.md](DEPLOYMENT.md).

## Dezvoltare

### Rulare în modul dezvoltare
```bash
npm run dev
```

### Testare locală
```bash
./test-local.sh
```

### Funcționalități cheie

- **Rate Limiting**: 30 req/min pentru subtitrări, 60 req/min pentru download
- **Stream Download**: Descarcă și extrage în paralel pentru latență redusă
- **Cache Inteligent**: 30 zile pentru seriale, preîncarcă următoarele 3 episoade
- **Cleanup Automat**: Logs și fișiere temporare șterse automat după 48h
- **IPv6 Ready**: Suport complet pentru rețele moderne
- **Scraping Protection**: Delay 1.5s între requests + User-Agent configurabil

## Contribuții

Contribuțiile sunt binevenite! Nu ezitați să trimiteți un Pull Request.

### Ghid pentru contribuitori
1. Fork-uiți repository-ul
2. Creați un branch pentru feature (`git checkout -b feature/AmazingFeature`)
3. Commit-uiți modificările (`git commit -m 'Add some AmazingFeature'`)
4. Push către branch (`git push origin feature/AmazingFeature`)
5. Deschideți un Pull Request

## Licență

Acest proiect este licențiat sub Licența MIT - vezi fișierul [LICENSE](LICENSE) pentru detalii.

## Disclaimer

Acest addon nu este afiliat cu subs.ro. Este un proiect comunitar care ajută utilizatorii români să acceseze subtitrări mai convenabil prin Stremio.

## Suport

Dacă întâmpinați probleme sau aveți sugestii, vă rugăm să deschideți un issue pe GitHub.

---

Creat cu ❤️ pentru comunitatea română Stremio

## Versiune

Versiunea curentă: **1.0.4** - Vezi [CHANGELOG.md](CHANGELOG.md) pentru istoric modificări.