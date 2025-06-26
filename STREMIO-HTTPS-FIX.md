# 🔐 Ghid Complet: Evitarea Problemelor HTTPS în Stremio

## ❗ Problema Inițială
Stremio **NU acceptă** addon-uri servite prin HTTP simplu din motive de securitate. Aceasta poate cauza erori la instalare.

## ✅ Soluții Implementate

### 1. **HTTPS Automat cu Let's Encrypt**
Script-ul de deployment configurează automat certificat SSL:
```bash
# În deploy-hetzner.sh:
certbot --nginx -d $DOMAIN --agree-tos -m $EMAIL --redirect --non-interactive
```

### 2. **PUBLIC_URL Obligatoriu**
**FOARTE IMPORTANT**: Setează corect în `.env`:
```bash
PUBLIC_URL=https://addon.domeniul-tau.com  # NU http://
```

### 3. **CORS Headers Triple-Layer**
Am implementat CORS în 3 locuri pentru redundanță:

**a) NGINX (deployment/nginx/nginx.conf):**
```nginx
add_header Access-Control-Allow-Origin "*" always;
add_header Access-Control-Allow-Headers "Accept, Content-Type" always;
add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
```

**b) Express Middleware (addon-fixed.js):**
```javascript
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    // ...
});
```

**c) Environment Variables (opțional):**
```bash
CORS_ORIGINS=https://app.stremio.com,https://web.stremio.com
```

### 4. **Redirect Automat HTTP → HTTPS**
NGINX forțează HTTPS pentru toate request-urile.

### 5. **Script de Verificare Post-Deployment**
Am creat `post-deploy-check.sh` care verifică automat:
- ✅ PUBLIC_URL setat corect
- ✅ Certificat SSL valid
- ✅ Redirect HTTP → HTTPS funcțional
- ✅ CORS headers prezente
- ✅ Manifest accesibil
- ✅ Endpoint-uri funcționale

## 🚀 Cum să Eviți Permanent Problemele

### 1. **La Prima Instalare**
```bash
# 1. Clonează și configurează
git clone <repo-url>
cd subsro-stremio-addon

# 2. Creează .env din template
cp .env.example .env

# 3. EDITEAZĂ .env și setează PUBLIC_URL corect!
nano .env
# PUBLIC_URL=https://addon.domeniul-tau.com

# 4. Rulează deployment
cd deployment/hetzner
./deploy-hetzner.sh
```

### 2. **După Deployment**
Verifică automat totul:
```bash
cd /opt/stremio-addon
./deployment/hetzner/post-deploy-check.sh
```

### 3. **Testare Manuală**
```bash
# Test HTTPS redirect
curl -I http://addon.domeniul-tau.com
# Trebuie să vezi: HTTP/1.1 301 Moved Permanently

# Test manifest cu CORS
curl -I https://addon.domeniul-tau.com/manifest.json
# Trebuie să vezi: Access-Control-Allow-Origin: *

# Test funcționalitate
curl https://addon.domeniul-tau.com/subtitles/movie/tt0111161.json
```

## 🔧 Troubleshooting

### Eroare: "Cannot install addon"
1. Verifică PUBLIC_URL în .env
2. Rulează post-deploy-check.sh
3. Verifică certificatul SSL: `certbot certificates`

### Eroare: "CORS error"
1. Verifică NGINX config: `nginx -t`
2. Restart NGINX: `systemctl restart nginx`
3. Check logs: `tail -f /var/log/nginx/error.log`

### Eroare: "Connection refused"
1. Verifică serviciul: `systemctl status stremio-addon`
2. Verifică firewall Hetzner (ports 80, 443)
3. Check logs: `journalctl -u stremio-addon -f`

## 📌 Checklist Final

- [ ] `.env` conține `PUBLIC_URL=https://...` (nu http)
- [ ] Domeniul are DNS corect configurat (A record)
- [ ] Certificat SSL valid și activ
- [ ] CORS headers prezente în response
- [ ] Firewall permite porturile 80 și 443
- [ ] Serviciul stremio-addon rulează
- [ ] URL-ul manifest.json este accesibil din browser

## 💡 Pro Tips

1. **Folosește întotdeauna HTTPS** în URL-ul pentru Stremio
2. **Verifică logs** pentru erori: `journalctl -u stremio-addon -f`
3. **Monitorizează** health endpoint: `https://addon.domeniul-tau.com/health`
4. **Backup** certificatele Let's Encrypt: `/etc/letsencrypt/`
5. **Auto-renewal** pentru SSL este configurat automat de Certbot

---

Cu această configurare, nu ar trebui să mai ai probleme cu instalarea în Stremio! 🎉