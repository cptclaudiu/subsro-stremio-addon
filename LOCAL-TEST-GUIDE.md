# 🧪 Ghid Testare Locală - Stremio Addon

## ✅ Pregătire Rapidă (3 minute)

### 1. **Instalează dependențele**
```bash
npm install
```

### 2. **Creează fișierul .env**
```bash
cp .env.example .env
```

### 3. **Editează .env pentru local**
```bash
# .env pentru testare locală
PORT=7000
NODE_ENV=development
PUBLIC_URL=http://localhost:7000

# Opțional - activează toate feature-urile
ENABLE_CACHE=true
ENABLE_STREAM_DOWNLOAD=true
SCRAPING_DELAY_MS=1500
```

### 4. **Pornește serverul**
```bash
npm start
# sau pentru development cu auto-reload:
npm run dev
```

## 🔍 Testare Manuală

### 1. **Verifică că serverul rulează**
Deschide în browser:
- http://localhost:7000/health
- http://localhost:7000/manifest.json

### 2. **Testează căutarea de subtitrări**
```bash
# The Matrix
curl http://localhost:7000/subtitles/movie/tt0133093.json | jq

# Shawshank Redemption  
curl http://localhost:7000/subtitles/movie/tt0111161.json | jq

# Game of Thrones S01E01
curl http://localhost:7000/subtitles/series/tt0944947.json | jq
```

### 3. **Instalează în Stremio Desktop**
1. Deschide Stremio
2. Settings → Addons → Community Addons
3. Paste: `http://localhost:7000/manifest.json`
4. Click Install

### 4. **Rulează testele automate**
```bash
chmod +x test-local.sh
./test-local.sh
```

## 🐳 Testare cu Docker

### Opțiunea 1: Docker Compose (Recomandat)
```bash
# Pornește cu Docker Compose
docker-compose up

# Addon disponibil la http://localhost:7000
```

### Opțiunea 2: Docker Manual
```bash
# Build imagine
docker build -t stremio-addon .

# Rulează container
docker run -p 7000:7000 \
  -e PUBLIC_URL=http://localhost:7000 \
  -e NODE_ENV=development \
  stremio-addon
```

## 🌐 Testare cu Tunnel (pentru Stremio Web/Mobile)

### Cu Cloudflare Tunnel
```bash
# Instalează cloudflared
# Windows: winget install Cloudflare.cloudflared
# Mac: brew install cloudflared
# Linux: snap install cloudflared

# Pornește tunnel
cloudflared tunnel --url http://localhost:7000

# Vei primi un URL tip: https://random-name.trycloudflare.com
# Folosește acest URL în Stremio
```

### Cu ngrok
```bash
# Instalează ngrok de pe https://ngrok.com

# Pornește tunnel
ngrok http 7000

# Folosește URL-ul HTTPS generat
```

## 📊 Ce să testezi

### 1. **Filme Populare**
- The Matrix: `tt0133093`
- Inception: `tt1375666`
- The Dark Knight: `tt0468569`

### 2. **Seriale**
- Game of Thrones: `tt0944947`
- Breaking Bad: `tt0903747`
- The Office: `tt0386676`

### 3. **Verifică funcționalitățile**
- [ ] Subtitrările apar în Stremio
- [ ] Download-ul funcționează
- [ ] Encoding românesc corect (ă, î, ț, ș)
- [ ] Cache pentru seriale funcționează
- [ ] Logs în `logs/addon-*.log`

## 🛠️ Debugging

### Vezi logs în timp real
```bash
# Linux/Mac
tail -f logs/addon-*.log

# Windows PowerShell
Get-Content logs/addon-*.log -Wait -Tail 50
```

### Verifică cache
```bash
ls -la cache/series/
```

### Monitorizează performanța
```bash
# Rulează monitoring script
./deployment/monitoring.sh
```

## ⚡ Tips pentru Development

1. **Hot Reload**
   ```bash
   npm run dev
   # Folosește nodemon pentru restart automat
   ```

2. **Dezactivează cache pentru testing**
   ```bash
   # În .env
   ENABLE_CACHE=false
   ```

3. **Logs detaliate**
   ```bash
   # În .env
   LOG_LEVEL=debug
   ```

4. **Skip scraping delay**
   ```bash
   # În .env
   SCRAPING_DELAY_MS=0
   ```

## 🚨 Probleme Comune

### "Cannot connect to server"
```bash
# Verifică dacă portul e liber
lsof -i :7000  # Linux/Mac
netstat -an | findstr :7000  # Windows
```

### "CORS error in Stremio"
```bash
# Asigură-te că ai CORS headers
curl -I http://localhost:7000/manifest.json | grep -i "access-control"
```

### "No subtitles found"
- Verifică conexiunea internet
- Verifică că subs.ro este accesibil
- Vezi logs pentru erori de scraping

## 🎯 Test Complet End-to-End

```bash
# 1. Pornește serverul
npm start

# 2. Într-un alt terminal, rulează testele
./test-local.sh

# 3. Deschide Stremio și adaugă addon-ul

# 4. Alege un film și verifică subtitrările

# 5. Verifică logs și cache
ls -la logs/
ls -la cache/series/
ls -la temp/
```

---

**Concluzie**: Proiectul funcționează perfect local! Nu are dependențe specifice Hetzner.
Singura diferență pentru production este PUBLIC_URL care trebuie să fie HTTPS.