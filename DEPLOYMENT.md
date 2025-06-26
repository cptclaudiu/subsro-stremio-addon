# Ghid de Deployment pentru Stremio Addon subs.ro

## Pregătirea pentru Deployment

### 1. Configurare Variabile de Mediu

Creează un fișier `.env` bazat pe `.env.example`:

```bash
cp .env.example .env
```

Editează `.env` și setează URL-ul public:
```
PUBLIC_URL=https://your-addon-domain.com
```

### 2. Verificare Locală

```bash
npm install
npm start
```

Testează addon-ul la: `http://localhost:7000/health`

## Opțiuni de Deployment

### Opțiunea A: Heroku

1. Instalează Heroku CLI
2. Creează aplicația:
```bash
heroku create your-addon-name
heroku config:set PUBLIC_URL=https://your-addon-name.herokuapp.com
heroku config:set NODE_ENV=production
heroku config:set DISABLE_PROXIES=true
git push heroku main
```

### Opțiunea B: Railway

1. Conectează repository-ul GitHub
2. Setează variabilele de mediu în Railway Dashboard:
   - `PUBLIC_URL`: URL-ul generat de Railway
   - `NODE_ENV`: production
   - `DISABLE_PROXIES`: true
3. Deploy automat la fiecare push

### Opțiunea C: Docker (VPS/Cloud)

1. Build și rulează:
```bash
docker build -f deployment/docker/Dockerfile -t stremio-subsro .
docker run -d \
  -p 7000:7000 \
  -e PUBLIC_URL=https://your-domain.com \
  -e NODE_ENV=production \
  -e DISABLE_PROXIES=true \
  --name stremio-addon \
  stremio-subsro
```

**SAU** folosește docker-compose:
```bash
docker-compose -f deployment/docker/docker-compose.yml up -d
```

2. Configurează reverse proxy (Nginx):
```bash
# Copiază configurația
sudo cp deployment/nginx/nginx.conf /etc/nginx/sites-available/stremio-addon
sudo ln -s /etc/nginx/sites-available/stremio-addon /etc/nginx/sites-enabled/
# Editează și înlocuiește domeniul
sudo nano /etc/nginx/sites-available/stremio-addon
sudo nginx -t && sudo systemctl reload nginx
```

### Opțiunea D: Render.com

1. Conectează repository-ul GitHub
2. Alege "Web Service"
3. Setează:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment Variables:
     - `PUBLIC_URL`: URL-ul generat de Render
     - `NODE_ENV`: production
     - `DISABLE_PROXIES`: true

## Verificare Post-Deployment

1. **Health Check**:
   ```bash
   curl https://your-addon-url.com/health
   ```

2. **Manifest**:
   ```bash
   curl https://your-addon-url.com/manifest.json
   ```

3. **Test Subtitle**:
   ```bash
   curl https://your-addon-url.com/subtitles/movie/tt0111161.json
   ```

4. **Instalare în Stremio**:
   - Deschide Stremio
   - Settings → Add-ons → Install from URL
   - Introdu: `https://your-addon-url.com/manifest.json`

## Monitorizare

### Logs
- Heroku: `heroku logs --tail`
- Docker: `docker logs -f stremio-addon`
- Railway/Render: Vezi dashboard-ul platformei

### Health Endpoint
Endpoint-ul `/health` oferă informații despre:
- Status addon
- Timp de răspuns subs.ro
- Stare director temp
- Uptime

## Troubleshooting

### Addon nu apare în Stremio
- Verifică HTTPS (obligatoriu pentru deployment public)
- Verifică manifest.json este accesibil
- Verifică CORS headers

### Subtitrările nu se încarcă
- Verifică logs pentru erori
- Verifică PUBLIC_URL este setat corect
- Verifică subs.ro este accesibil din server

### Erori de memorie
- Crește limita de memorie pentru Node.js
- Activează cleanup mai agresiv în features.js

## Securitate

1. **Nu expune informații sensibile** în logs
2. **Folosește HTTPS** întotdeauna pentru producție
3. **Limitează CORS** origins dacă e posibil
4. **Monitorizează** utilizarea pentru a detecta abuzuri

## Actualizări

Pentru actualizări:
1. Testează local mai întâi
2. Fă backup la .env și date importante
3. Deploy cu zero-downtime dacă e posibil
4. Verifică health check după deployment