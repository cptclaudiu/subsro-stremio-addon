# 📁 Structura Detaliată Proiect Stremio Addon subs.ro

## 🎯 Prezentare Generală

Acest addon pentru Stremio oferă subtitrări în limba română de pe subs.ro - cea mai mare comunitate de subtitrări din România. Proiectul este organizat pentru deployment ușor pe diverse platforme cloud, cu accent pe Hetzner Cloud, și respectă toate cerințele tehnice ale protocolului Stremio.

## 🗂️ Structura Completă a Proiectului

```
subsro-stremio-addon/
│
├── 📄 addon-fixed.js                # Server Express cu rate limiting și SDK Stremio
├── 📄 package.json                  # Dependențe NPM (include express-rate-limit)
├── 📄 package-lock.json            # Lock file pentru versiuni exacte NPM
├── 📄 test-local.sh                 # Script testare rapidă locală
│
├── 📁 .github/                      # GitHub Actions CI/CD
│   └── 📁 workflows/
│       └── 📄 test.yml              # Teste automate (manifest, CORS, endpoints)
│
├── 📁 lib/                         # Module principale ale aplicației
│   ├── 📄 subsRoService.js         # (41KB) Serviciul principal - scraping subs.ro
│   ├── 📄 streamExtractor.js       # (9KB) Download și extracție cu streaming
│   ├── 📄 seriesCache.js           # (10KB) Sistem de cache pentru episoade seriale
│   ├── 📄 logger.js                # (5KB) Sistem de logging cu cleanup automat
│   ├── 📄 rarExtractor.js          # (4KB) Extractor pentru arhive RAR
│   ├── 📄 episodeExtractor.js      # (3KB) Parser pentru detectarea episoadelor
│   ├── 📄 proxyRotator.js          # (8KB) Rotație proxy pentru evitarea rate limiting
│   └── 📄 downloadQueue.js         # (5KB) Coadă de download cu limite concurente
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
│   │   ├── 📄 hetzner-firewall.json # Reguli firewall pentru Hetzner Cloud
│   │   ├── 📄 post-deploy-check.sh  # Script verificare post-deployment
│   │   └── 📄 HETZNER-DEPLOY.md    # Ghid detaliat pentru Hetzner
│   │
│   ├── 📁 nginx/                   
│   │   └── 📄 nginx.conf           # Config NGINX cu HTTPS și CORS
│   │
│   ├── 📁 systemd/                 
│   │   ├── 📄 systemd-maintenance.service  # Service pentru curățenie
│   │   ├── 📄 systemd-maintenance.timer    # Timer zilnic (3 AM)
│   │   └── 📄 logrotate.d-stremio-addon   # Rotație automată logs
│   │
│   ├── 📄 maintenance.sh           # Script curățenie și verificări
│   ├── 📄 monitoring.sh            # Script monitorizare live
│   └── 📄 README.md               # Documentație deployment
│
├── 📁 cache/                       # Cache runtime (persistent)
│   └── 📁 series/                  # Cache JSON pentru episoade (30 zile)
│
├── 📁 logs/                        # Logs aplicație (auto-cleanup după 48h)
├── 📁 temp/                        # Fișiere temporare SRT (cleanup după 48h)
│
├── 📄 .env.example                 # Template variabile de mediu
├── 📄 .gitignore                   # Fișiere ignorate de Git
├── 📄 .dockerignore                # Fișiere ignorate de Docker
│
├── 📄 README.md                    # Documentație principală (RO)
├── 📄 DEPLOYMENT.md                # Ghid deployment general
├── 📄 DEPLOYMENT-CHECKLIST.md      # Checklist verificare
├── 📄 QUICK-START.md               # Ghid pornire rapidă
├── 📄 PROJECT-STRUCTURE.md         # Acest fișier
├── 📄 CHANGELOG.md                 # Istoric versiuni și modificări
├── 📄 STREMIO-HTTPS-FIX.md         # Ghid rezolvare probleme HTTPS
├── 📄 cloudflared.service          # Service systemd pentru Cloudflare Tunnel
└── 📄 docker-compose.yml           # Docker compose pentru development
```

## 📝 Descrierea Detaliată a Fișierelor

### 🚀 Core Application

#### `addon-fixed.js` (v1.0.4)
**Scop**: Server-ul principal care rulează addon-ul Stremio.

**Ce face**:
- Inițializează server Express.js pe portul configurat (default 7000)
- Integrează Stremio SDK pentru comunicare cu aplicația Stremio
- Implementează rate limiting pentru protecție împotriva abuzului:
  - 30 requests/minut pentru subtitrări
  - 60 requests/minut pentru download fișiere
- Configurează CORS headers pentru compatibilitate cross-origin
- Timeout protection de 4.5 secunde pentru toate request-urile
- Dotenv support pentru variabile de mediu

**Endpoint-uri**:
- `GET /manifest.json` - Returnează metadatele addon-ului
- `GET /subtitles/:type/:id.json` - Caută subtitrări pentru un film/serial
- `GET /subtitle/:filename` - Servește fișierele SRT descărcate
- `GET /health` - Health check comprehensiv (include status subs.ro)
- `GET /proxy-status` - Afișează status proxy rotation (doar development)

**De ce e important**: Aceasta este inima addon-ului, punctul de intrare pentru toate request-urile de la Stremio.

### 📚 Librării (`/lib`)

#### `subsRoService.js` (41KB)
**Scop**: Serviciul principal care gestionează toată logica de business pentru obținerea subtitrărilor.

**Ce face**:
- Web scraping pe subs.ro folosind Cheerio
- Caută subtitrări după IMDB ID (ex: tt0111161 pentru Shawshank Redemption)
- Descarcă arhivele ZIP/RAR care conțin subtitrările
- Extrage fișierele SRT din arhive
- Detectează și convertește encoding-ul românesc (cp1250, iso-8859-2)
- Sortează subtitrările după calitate (BluRay > WEB-DL > HDTV)
- Cleanup automat pentru fișiere mai vechi de 48 ore
- Respectă rate limiting cu delay între requests (1.5s implicit)
- User-Agent personalizabil pentru conformitate ToS

**Funcții principale**:
- `searchSubtitles(imdbId, videoFilename)` - Caută și returnează subtitrări
- `extractQualityTag(filename)` - Detectează calitatea (BluRay, WEB-DL, etc)
- `sortSubtitlesByQuality()` - Ordonează rezultatele după relevanță
- `downloadAndExtract()` - Descarcă și extrage arhivele

**De ce e important**: Aceasta este logica de business principală, face toată munca grea de scraping și procesare.

#### `streamExtractor.js` (9KB) 
**Scop**: Implementează download și extracție paralelă pentru performanță mai bună.

**Ce face**:
- Download cu streaming pentru procesare în timp real
- Începe extracția ZIP înainte de finalizarea download-ului
- Reduce latența cu până la 40% pentru arhive mari
- Logging detaliat al progresului (la fiecare 10%)
- Gestionare memorie eficientă prin streaming

**Funcții principale**:
- `downloadAndExtractStream()` - Download și extracție paralelă
- `extractZipStream()` - Procesează ZIP-uri în timp real
- Evenimente emise: `progress`, `file-extracted`, `completed`

**De ce e important**: Îmbunătățește semnificativ timpul de răspuns pentru utilizatori.

#### `seriesCache.js` (10KB)
**Scop**: Sistem inteligent de cache pentru seriale TV.

**Ce face**:
- Cache persistent pe disk în format JSON
- Preîncarcă automat următoarele 3 episoade
- Expiră după 30 zile (configurabil)
- Cleanup automat la pornire pentru fișiere expirate
- Format cache: `tt0455275_S04_E07.json`

**Funcții principale**:
- `getCachedSubtitles()` - Verifică cache-ul
- `setCachedSubtitles()` - Salvează în cache
- `preloadNextEpisodes()` - Preîncarcă episoade viitoare
- `cleanupExpiredCache()` - Șterge cache expirat

**De ce e important**: Reduce dramatic timpul de răspuns pentru seriale și încărcarea pe subs.ro.

#### `logger.js` (5KB)
**Scop**: Sistem centralizat de logging cu management automat.

**Ce face**:
- Logging colorat în consolă pentru development
- Salvare în fișiere cu rotație zilnică
- Cleanup automat pentru logs > 48h sau > 500MB
- Nivele: ERROR, WARN, INFO, SUCCESS, DEBUG
- Format: `[2024-01-15 14:23:45] [12345] [INFO] Mesaj aici`
- Crează automat directorul `/logs` dacă nu există

**Funcții principale**:
- `logger.info()`, `logger.error()`, `logger.success()`, etc.
- `cleanupOldLogs()` - Șterge logs vechi automat
- Rotație automată la miezul nopții

**De ce e important**: Esențial pentru debugging și monitorizare în producție.

#### `rarExtractor.js` (4KB)
**Scop**: Extrage subtitrări din arhive RAR.

**Ce face**:
- Folosește node-unrar-js pentru extracție
- Suport pentru arhive RAR multi-part
- Detectează și extrage doar fișiere SRT/SUB
- Gestionare erori robustă
- Validare arhive corupte

**Funcții principale**:
- `extract(rarPath, outputDir)` - Extrage arhiva
- `findSubtitleFiles()` - Găsește fișiere subtitrare
- Suport pentru RAR5 și versiuni mai vechi

**De ce e important**: Multe subtitrări pe subs.ro sunt arhivate în RAR.

#### `episodeExtractor.js` (3KB)
**Scop**: Parser inteligent pentru detectarea episoadelor din seriale.

**Ce face**:
- Detectează pattern-uri S##E## (ex: S01E05)
- Normalizează nume fișiere pentru comparație
- Suport pentru formate alternative (1x05, 105)
- Extrage sezon și episod din nume complexe

**Funcții principale**:
- `extractEpisodeInfo()` - Parsează informații episod
- `normalizeEpisodeName()` - Standardizează formatul
- `matchEpisode()` - Compară episoade

**De ce e important**: Critic pentru potrivirea corectă a subtitrărilor cu episoadele.

#### `proxyRotator.js` (8KB)
**Scop**: Sistem de rotație proxy pentru evitarea blocărilor.

**Ce face**:
- Rotație automată între proxy-uri configurate
- Health tracking pentru fiecare proxy
- Retry logic cu fallback la direct connection
- Dezactivat implicit în producție
- Statistici detaliate despre utilizare

**Funcții principale**:
- `getNextProxy()` - Selectează următorul proxy sănătos
- `markProxyFailed()` - Marchează proxy ca nefuncțional
- `getStats()` - Returnează statistici utilizare

**De ce e important**: Util pentru development și testare intensivă.

#### `downloadQueue.js` (5KB)
**Scop**: Gestionează descărcările concurente cu limite.

**Ce face**:
- Limitează descărcări simultane (default: 3)
- Priority queue pentru request-uri importante
- Timeout protection pentru descărcări blocate
- Retry logic pentru eșecuri temporare
- Event-based pentru progress tracking

**Funcții principale**:
- `enqueue()` - Adaugă în coadă
- `process()` - Procesează următoarea descărcare
- `setPriority()` - Setează prioritate înaltă

**De ce e important**: Previne supraîncărcarea serverului și a conexiunii.

### ⚙️ Configurare (`/config`)

#### `features.js`
**Scop**: Centralizează toate feature flags pentru control ușor.

**Configurări**:
```javascript
{
  useProxies: false,        // Proxy rotation (doar dev)
  useSeriesCache: true,     // Cache pentru seriale
  preloadNextEpisodes: true,// Preîncarcă episoade
  cacheDuration: 720,       // 30 zile în ore
  maxConcurrentDownloads: 3,// Descărcări simultane
  enableStreamDownload: true // Download cu streaming
}
```

**De ce e important**: Permite activarea/dezactivarea funcționalităților fără modificări de cod.

#### `proxies.js`
**Scop**: Listă de proxy-uri pentru rotație.

**Format**:
```javascript
module.exports = [
  // { url: 'http://proxy1.com:8080', auth: 'user:pass' },
  // { url: 'http://proxy2.com:8080' }
];
```

**De ce e important**: Configurare externă pentru proxy-uri când e necesar.

### 🐳 Deployment (`/deployment`)

#### Docker (`/deployment/docker/`)

##### `Dockerfile`
**Scop**: Definește imaginea Docker pentru addon.

**Caracteristici**:
- Multi-stage build pentru imagine mică (~150MB)
- Node.js 18 Alpine Linux (securitate și performanță)
- Non-root user pentru securitate
- Health check integrat
- Build tools pentru native dependencies

**De ce e important**: Containerizare pentru deployment consistent.

##### `docker-compose.yml`
**Scop**: Orchestrare Docker pentru producție.

**Include**:
- Service definition cu restart policy
- Volume mounts pentru persistență
- Environment variables
- Health checks
- Port mapping
- Resource limits

**De ce e important**: Deployment one-command cu Docker.

#### Hetzner (`/deployment/hetzner/`)

##### `deploy-hetzner.sh`
**Scop**: Script complet automatizat pentru deployment pe Hetzner VPS.

**Ce face** (pas cu pas):
1. Actualizează sistemul Ubuntu
2. Instalează Node.js 18 via NodeSource
3. Instalează și configurează NGINX
4. Instalează Certbot pentru SSL
5. Clonează repository-ul
6. Instalează dependențe NPM
7. Configurează systemd service
8. Obține certificat Let's Encrypt
9. Configurează firewall
10. Pornește serviciul

**De ce e important**: Deployment complet automatizat în ~5 minute.

##### `post-deploy-check.sh`
**Scop**: Verifică că deployment-ul s-a făcut corect.

**Verificări**:
- PUBLIC_URL setat corect în .env
- Certificat SSL valid și activ
- Redirect HTTP → HTTPS funcțional
- CORS headers prezente
- Toate endpoint-urile accesibile
- Serviciul rulează corect

**De ce e important**: Previne problemele comune post-deployment.

##### `hetzner-firewall.json`
**Scop**: Reguli firewall pentru Hetzner Cloud.

**Reguli**:
```json
{
  "rules": [
    {
      "direction": "in",
      "port": "80",
      "protocol": "tcp",
      "source_ips": ["0.0.0.0/0", "::/0"]
    },
    {
      "direction": "in", 
      "port": "443",
      "protocol": "tcp",
      "source_ips": ["0.0.0.0/0", "::/0"]
    }
  ]
}
```

**De ce e important**: Securitate la nivel de rețea.

#### NGINX (`/deployment/nginx/`)

##### `nginx.conf`
**Scop**: Configurare reverse proxy pentru addon.

**Caracteristici**:
- SSL/TLS cu HTTP/2
- IPv6 support complet
- CORS headers obligatorii
- Gzip compression
- Cache headers
- Timeout 5 secunde
- Access logs structurate

**De ce e important**: Servește addon-ul pe HTTPS cu performanță optimă.

#### Systemd (`/deployment/systemd/`)

##### `systemd-maintenance.service` & `.timer`
**Scop**: Curățenie automată programată.

**Ce face**:
- Rulează zilnic la 3 AM
- Șterge logs > 48 ore
- Șterge temp files > 48 ore
- Verifică spațiu disk
- Trimite alerte dacă e necesar

**De ce e important**: Menține serverul curat automat.

##### `logrotate.d-stremio-addon`
**Scop**: Rotație automată logs NGINX și aplicație.

**Configurare**:
- Rotație zilnică
- Păstrează 7 zile
- Compresie după 1 zi
- Recreare automată fișiere

**De ce e important**: Previne umplerea diskului cu logs.

#### Scripts (`/deployment/`)

##### `maintenance.sh`
**Scop**: Script manual/automat pentru curățenie.

**Operații**:
- Cleanup logs vechi
- Cleanup temp files
- Verificare spațiu disk
- Restart servicii dacă e necesar
- Logging operații efectuate

**De ce e important**: Mentenanță preventivă.

##### `monitoring.sh`
**Scop**: Monitorizare live a addon-ului.

**Afișează**:
- Status serviciu
- Utilizare CPU/RAM
- Request-uri pe minut
- Erori recente
- Spațiu disk disponibil

**De ce e important**: Debugging și monitorizare în timp real.

### 📊 Directoare Runtime

#### `/cache/series/`
**Scop**: Stocare cache pentru subtitrări seriale.

**Caracteristici**:
- Fișiere JSON cu metadata subtitrări
- Nume format: `tt0455275_S04_E07.json`
- TTL 30 zile (configurabil)
- Cleanup automat

**De ce e important**: Performanță dramatică mai bună pentru seriale.

#### `/logs/`
**Scop**: Jurnale aplicație pentru debugging.

**Conține**:
- `addon-YYYY-MM-DD.log` - Log-uri zilnice
- Rotație automată la miezul nopții
- Cleanup > 48 ore sau > 500MB

**De ce e important**: Esențial pentru troubleshooting.

#### `/temp/`
**Scop**: Stocare temporară fișiere descărcate.

**Conține**:
- Arhive RAR/ZIP descărcate
- Fișiere SRT extrase
- Cleanup > 48 ore
- Nume unice cu timestamp

**De ce e important**: Working directory pentru procesare.

### 📄 Fișiere Configurare

#### `.env.example`
**Scop**: Template pentru variabile de mediu.

**Variabile importante**:
- `PUBLIC_URL` - URL public HTTPS (OBLIGATORIU!)
- `PORT` - Port server (default: 7000)
- `NODE_ENV` - Environment (production/development)
- `SCRAPING_DELAY_MS` - Delay între requests
- `ENABLE_STREAM_DOWNLOAD` - Activare streaming

**De ce e important**: Configurare externalizată pentru securitate.

#### `.gitignore`
**Scop**: Exclude fișiere din version control.

**Exclude**:
- `node_modules/`
- `.env`
- `logs/`
- `temp/`
- `cache/`

**De ce e important**: Păstrează repository-ul curat.

#### `.dockerignore`
**Scop**: Exclude fișiere din Docker build.

**Similar cu .gitignore plus**:
- `.git/`
- `deployment/`
- `*.md`

**De ce e important**: Imagini Docker mai mici.

### 📚 Documentație

#### `README.md`
**Scop**: Documentație principală în română.

**Include**:
- Prezentare generală
- Instrucțiuni instalare
- Configurare
- Structură proiect
- Troubleshooting
- Disclaimer legal

**De ce e important**: Primul contact cu proiectul.

#### `DEPLOYMENT.md`
**Scop**: Ghid complet deployment.

**Platforme acoperite**:
- Hetzner Cloud
- Docker
- Heroku
- Railway
- Manual VPS

**De ce e important**: Instrucțiuni pas-cu-pas pentru production.

#### `DEPLOYMENT-CHECKLIST.md`
**Scop**: Checklist pre și post deployment.

**Verificări**:
- [ ] Environment variables
- [ ] SSL/HTTPS
- [ ] CORS headers
- [ ] Rate limiting
- [ ] Monitoring
- [ ] Backup

**De ce e important**: Previne omiterea pașilor critici.

#### `STREMIO-HTTPS-FIX.md`
**Scop**: Rezolvare probleme HTTPS specifice Stremio.

**Acoperă**:
- De ce Stremio necesită HTTPS
- Configurare SSL corectă
- Troubleshooting CORS
- Verificări post-deployment

**De ce e important**: Rezolvă cea mai comună problemă.

#### `CHANGELOG.md`
**Scop**: Istoric versiuni și modificări.

**Format**:
- Versionare semantică
- Data lansării
- Added/Changed/Fixed sections
- Breaking changes evidențiate

**De ce e important**: Tracking evoluție proiect.

### 🔧 Alte Fișiere

#### `test-local.sh`
**Scop**: Script testare rapidă locală.

**Teste**:
- Server pornește corect
- Manifest accesibil
- CORS headers prezente
- Endpoint-uri funcționale
- Response time < 5s

**De ce e important**: Validare rapidă înainte de deployment.

#### `cloudflared.service`
**Scop**: Service systemd pentru Cloudflare Tunnel.

**Pentru**:
- Expunere addon fără port forwarding
- Bypass NAT/firewall
- Development remote

**De ce e important**: Alternativă la deployment clasic.

#### `docker-compose.yml` (root)
**Scop**: Docker compose pentru development local.

**Diferit de production**:
- Volume mount pentru hot reload
- Exposed ports pentru debugging
- Environment overrides

**De ce e important**: Development environment consistent.

## 🔧 Concepte Tehnice Stremio & Hosting

### 📡 Protocolul Stremio

#### Ce este Stremio?
Stremio este o platformă de streaming media care agregă conținut din diverse surse. Funcționează cu un sistem de "addon-uri" care extind funcționalitatea de bază.

#### Cum funcționează addon-urile?
1. **Manifest** - Fiecare addon declară ce poate face (types, resources)
2. **Request/Response** - Stremio trimite request-uri HTTP, addon-ul răspunde JSON
3. **Stateless** - Fiecare request este independent, nu există sesiuni
4. **Resources** - Un addon poate oferi: catalog, meta, stream, subtitles

#### Cerințe tehnice addon:
- **HTTPS obligatoriu** - Stremio refuză addon-uri HTTP din motive de securitate
- **CORS headers** - Necesare pentru request-uri cross-origin din web app
- **Timeout 5 secunde** - Stremio anulează request-uri care durează prea mult
- **Format JSON strict** - Răspunsurile trebuie să respecte schema exactă

#### Flow-ul pentru subtitrări:
1. User selectează un film/episod în Stremio
2. Stremio trimite request: `/subtitles/movie/tt1234567.json`
3. Addon-ul caută subtitrări pentru acel IMDB ID
4. Returnează array de obiecte: `[{id, url, lang}]`
5. Stremio afișează opțiunile utilizatorului
6. La selectare, Stremio descarcă de la URL-ul furnizat

### ☁️ Hosting Public

#### De ce HTTPS?
- **Securitate** - Criptare end-to-end
- **Cerință Stremio** - Refuză addon-uri HTTP
- **SEO și Trust** - Browsere marchează HTTP ca nesigur

#### Platforme recomandate:

##### 1. **Hetzner Cloud** (Recomandat)
**Avantaje**:
- Servere în Germania (GDPR compliant)
- Prețuri excelente (€4.51/lună)
- Network performant
- API pentru automatizare

**Configurare optimă**:
- CX11 instance (1 vCPU, 2GB RAM)
- Ubuntu 22.04
- Floating IP pentru flexibilitate
- Backups automate

##### 2. **DigitalOcean**
**Avantaje**:
- Interfață user-friendly
- Multe tutoriale
- Snapshots ușoare
- Kubernetes disponibil

##### 3. **Railway/Render**
**Avantaje**:
- Deploy din GitHub direct
- SSL automat
- Zero config
- Free tier disponibil

#### Configurări critice hosting:

##### **Firewall**
```bash
# Minim necesar
- Port 80 (HTTP) - pentru redirect și Let's Encrypt
- Port 443 (HTTPS) - pentru addon
- Port 22 (SSH) - pentru administrare
```

##### **DNS**
```
# A Record
addon.example.com → IP-SERVER

# AAAA Record (pentru IPv6)
addon.example.com → IPv6-SERVER
```

##### **SSL/TLS**
- **Let's Encrypt** - Gratuit, automat cu Certbot
- **Cloudflare** - Proxy cu SSL inclus
- **Renewal automat** - Cron job pentru certbot

##### **Reverse Proxy (NGINX)**
Beneficii:
- Termină SSL/TLS
- Compression (gzip)
- Cache static files
- Rate limiting
- Load balancing

##### **Monitoring**
Esențial pentru production:
- **Uptime** - UptimeRobot, Pingdom
- **Logs** - Centralizate cu Loki/ELK
- **Metrics** - Prometheus + Grafana
- **Alerts** - Email/Slack pentru probleme

### 🔐 Securitate

#### Rate Limiting
- Protecție DDoS la nivel aplicație
- 30 req/min pentru subtitrări
- 60 req/min pentru downloads
- IP-based cu express-rate-limit

#### Headers Securitate
```javascript
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

#### Environment Variables
- Nu commite `.env` niciodată
- Folosește secrets management
- Rotate periodic credențiale

#### Updates
- Dependențe NPM lunar
- Security patches imediat
- OS updates regulat

### 🚀 Optimizări Performanță

#### Caching Strategy
1. **Browser Cache** - Headers pentru static files
2. **Application Cache** - Series episodes 30 zile
3. **CDN** - Pentru assets statice
4. **Database Query Cache** - N/A (no DB)

#### Compression
- Gzip pentru responses > 1KB
- Brotli pentru browsers moderne
- Imagini optimizate (logo)

#### Async Operations
- Toate I/O operations async
- Streaming pentru files mari
- Connection pooling pentru requests

#### Memory Management
- Stream processing pentru ZIP/RAR
- Cleanup automată temp files
- Node.js memory limits configurate

### 📊 Scalare

#### Vertical Scaling
- Crește RAM pentru cache mai mare
- CPU pentru procesare paralelă
- SSD pentru I/O rapid

#### Horizontal Scaling
- Load balancer (NGINX, HAProxy)
- Multiple instanțe Node.js
- Shared cache (Redis)
- Distributed filesystem

#### Auto-scaling
- CPU-based triggers
- Request rate triggers
- Queue size monitoring
- Graceful shutdown

## 🎯 Best Practices Implementate

1. **12-Factor App** - Environment config, stateless, logs as streams
2. **Security First** - HTTPS only, rate limiting, input validation  
3. **Error Handling** - Try-catch comprehensive, graceful degradation
4. **Logging** - Structured, rotated, multiple levels
5. **Documentation** - Code comments, README, examples
6. **Testing** - Automated CI/CD, local test script
7. **Monitoring** - Health endpoint, metrics, alerts
8. **Performance** - Caching, streaming, async operations
9. **Maintenance** - Auto cleanup, log rotation, updates
10. **User Experience** - Sub 5s response, relevant results, error messages

---

**Pentru deployment rapid vezi: `QUICK-START.md`**  
**Pentru probleme HTTPS vezi: `STREMIO-HTTPS-FIX.md`**