# ✅ Checklist Complet pentru Deploy Stremio Addon

## 🔍 Verificări Pre-Deploy

### 1. **Verificare Locală**
```bash
# Pornește addon-ul local
npm start

# Test manifest
curl -v http://localhost:7000/manifest.json

# Test subtitles (înlocuiește cu un IMDB ID valid)
curl -v http://localhost:7000/subtitles/movie/tt0111161.json
```

### 2. **Verificare Headers CORS**
```bash
curl -I http://localhost:7000/manifest.json | grep -i access-control
# Trebuie să vezi:
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Headers: Accept, Content-Type
```

## 🚀 Deploy cu Docker + NGINX

### 1. **Pregătire Server**
```bash
# Instalează Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Instalează Docker Compose
sudo apt-get install docker-compose-plugin

# Instalează Certbot pentru HTTPS
sudo apt-get install certbot python3-certbot-nginx
```

### 2. **Configurare Domeniu**
```bash
# Înlocuiește myaddon.example.com cu domeniul tău
sudo certbot certonly --standalone -d myaddon.example.com
```

### 3. **Deploy Addon**
```bash
# Clonează repository
git clone <your-repo>
cd subsro-stremio-addon

# Creează .env din exemplu
cp .env.example .env

# Editează .env și setează PUBLIC_URL
nano .env
# PUBLIC_URL=https://myaddon.example.com

# Editează nginx.conf și înlocuiește myaddon.example.com
sed -i 's/myaddon.example.com/your-actual-domain.com/g' nginx.conf

# Pornește serviciile
docker-compose -f docker-compose.production.yml up -d

# Verifică logs
docker-compose -f docker-compose.production.yml logs -f
```

## 🧪 Verificări Post-Deploy

### 1. **Test HTTPS & Certificate**
```bash
curl -Iv https://myaddon.example.com/manifest.json
# Verifică: HTTP/2 200, certificate valid
```

### 2. **Test CORS Headers**
```bash
curl -I https://myaddon.example.com/manifest.json | grep -i access-control
# OBLIGATORIU să vezi toate header-ele CORS
```

### 3. **Test Manifest Format**
```bash
curl -s https://myaddon.example.com/manifest.json | jq .
# Verifică JSON valid cu toate câmpurile obligatorii
```

### 4. **Test Endpoint Subtitles**
```bash
curl -s https://myaddon.example.com/subtitles/movie/tt0111161.json | jq .
# Verifică structura: { "subtitles": [...] }
```

### 5. **Test Timeout (< 5s)**
```bash
time curl https://myaddon.example.com/subtitles/movie/tt0111161.json
# real time trebuie < 5.0s
```

### 6. **Test Health Endpoint**
```bash
curl https://myaddon.example.com/health | jq .
```

## 📱 Instalare în Stremio

### Desktop
1. Settings → Add-ons → Install from URL
2. Introdu: `https://myaddon.example.com/manifest.json`
3. Click Install

### Web (app.stremio.com)
1. Același proces
2. OBLIGATORIU HTTPS cu certificat valid!

### Mobile
1. Deschide link în browser: `https://myaddon.example.com/manifest.json`
2. Se va deschide automat în Stremio

## 🐛 Troubleshooting

### "Failed to get addon manifest"
- Verifică HTTPS funcționează
- Verifică Content-Type: application/json
- Verifică nu ai redirect 301/302

### "ADDON_PUSH_FAILED"
- 99% problemă CORS
- Verifică nginx.conf are header-ele setate
- Clear cache în Stremio: Settings → General → Clear Local Storage

### "No streams" după instalare
- Verifică logs pentru ID-ul primit
- Verifică `idPrefixes: ["tt"]` în manifest
- Testează direct endpoint-ul cu curl

### Timeout errors
- Verifică subs.ro e accesibil din server
- Verifică nu ai rate limiting
- Măsoară timpul de răspuns cu `time curl`

## 📊 Monitorizare

```bash
# Logs addon
docker logs -f stremio-subsro-addon

# Logs NGINX
docker logs -f stremio-nginx

# Status servicii
docker ps

# Utilizare resurse
docker stats
```

## 🔄 Update Addon

```bash
# Pull ultimele modificări
git pull

# Rebuild și restart
docker-compose -f docker-compose.production.yml build
docker-compose -f docker-compose.production.yml up -d

# IMPORTANT: Crește version în manifest.json!
```

## ⚠️ Verificare Finală

- [ ] URL HTTPS public funcțional
- [ ] Certificate SSL valid (Let's Encrypt)
- [ ] manifest.json accesibil cu Content-Type corect
- [ ] CORS headers pe TOATE endpoint-urile
- [ ] Răspuns < 5 secunde
- [ ] idPrefixes: ["tt"] în manifest
- [ ] Logs clare, fără erori 4xx/5xx
- [ ] Version incrementat la fiecare update (OBLIGATORIU!)
- [ ] Testat pe Web + Desktop + Mobile
- [ ] Rate limiting configurat (30 req/min subtitrări, 60 req/min download)
- [ ] Delay scraping setat (1.5s implicit)
- [ ] User-Agent personalizat

**Dacă toate sunt bifate = Addon ready for production! 🎉**