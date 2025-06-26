# 🚀 Ghid Deploy Stremio Addon pe Hetzner VPS

## 📋 Pre-requisite

1. **Cont Hetzner Cloud** cu un VPS creat (CX11 suficient)
2. **Domeniu/Subdomeniu** (ex: `addon.example.com`)
3. **Repository Git** cu addon-ul tău

## 🛠️ Deployment Rapid (Script Automat)

### 1. Conectare la VPS
```bash
ssh root@YOUR_SERVER_IP
```

### 2. Download și rulare script
```bash
wget https://raw.githubusercontent.com/YOUR_REPO/main/deploy-hetzner.sh
chmod +x deploy-hetzner.sh
sudo ./deploy-hetzner.sh
```

Script-ul va:
- Instala Node.js 20, NGINX, Certbot
- Clona repository-ul tău
- Configura HTTPS cu Let's Encrypt
- Seta CORS headers corect
- Crea serviciu systemd
- Configura firewall

## 🔧 Deployment Manual (Pas cu Pas)

### 1. Pregătire Server
```bash
# Update sistem
apt update && apt full-upgrade -y

# Instalare Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs git
```

### 2. Clone Addon
```bash
cd /opt
git clone YOUR_REPO_URL stremio-addon
cd stremio-addon
npm ci --production
```

### 3. Configurare Environment
```bash
cp .env.example .env
nano .env
# Setează PUBLIC_URL=https://addon.example.com
```

### 4. Sistemd Service
```bash
cat > /etc/systemd/system/stremio-addon.service <<'EOF'
[Unit]
Description=Stremio Addon
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/stremio-addon
ExecStart=/usr/bin/node addon-fixed.js
Restart=always
Environment=NODE_ENV=production
Environment=PORT=7000

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now stremio-addon
```

### 5. NGINX + SSL
```bash
apt install -y nginx certbot python3-certbot-nginx

# Configurare NGINX (vezi nginx.conf din repository)
# Apoi:
certbot --nginx -d addon.example.com
```

## ⚠️ Configurare Hetzner Firewall

### În Hetzner Cloud Console:

1. **Networking → Firewalls**
2. **Create Firewall** sau editează existing
3. **Add Rules:**
   - **Inbound TCP 80** (Source: 0.0.0.0/0)
   - **Inbound TCP 443** (Source: 0.0.0.0/0)
   - **Inbound TCP 22** (SSH - optional restrict IP)
4. **Apply to Server**

### UFW Local (opțional):
```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 22/tcp
ufw enable
```

## 🧪 Verificări Post-Deploy

### 1. Test HTTPS & Certificate
```bash
curl -Iv https://addon.example.com/manifest.json
# Verifică: HTTP/2 200, certificate valid
```

### 2. Test CORS
```bash
curl -I https://addon.example.com/manifest.json | grep -i access-control
# Trebuie să vezi:
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Headers: Accept, Content-Type
```

### 3. Test Funcționalitate
```bash
# Manifest
curl -s https://addon.example.com/manifest.json | jq .

# Subtitles
curl -s https://addon.example.com/subtitles/movie/tt0111161.json | jq .

# Health
curl -s https://addon.example.com/health | jq .
```

## 🐛 Troubleshooting Specific Hetzner

### "Connection Timeout"
```bash
# Verifică Hetzner Firewall în Cloud Console
# Verifică UFW local
ufw status verbose

# Verifică NGINX rulează
systemctl status nginx

# Verifică addon rulează
systemctl status stremio-addon
```

### "502 Bad Gateway"
```bash
# Addon nu rulează sau nu ascultă pe 7000
journalctl -u stremio-addon -n 50

# Restart serviciu
systemctl restart stremio-addon
```

### "CORS Error"
```bash
# Verifică nginx config
nginx -t
cat /etc/nginx/sites-enabled/stremio-addon | grep -i cors

# Reload NGINX
systemctl reload nginx
```

## 📊 Monitorizare

### Logs Real-time
```bash
# Addon logs
journalctl -u stremio-addon -f

# NGINX access logs
tail -f /var/log/nginx/stremio-addon-access.log

# NGINX error logs
tail -f /var/log/nginx/stremio-addon-error.log
```

### Verificare Resurse
```bash
# CPU/RAM
htop

# Disk
df -h

# Network
ss -tulpn | grep -E ':(80|443|7000)'
```

## 🔄 Update Addon

```bash
cd /opt/stremio-addon
git pull
npm ci --production

# IMPORTANT: Crește version în manifest!
nano addon-fixed.js  # modifică version

systemctl restart stremio-addon
```

## 🎯 Checklist Final Hetzner

- [ ] VPS Hetzner creat și SSH funcțional
- [ ] DNS A/AAAA record către IP server
- [ ] Hetzner Firewall: 80, 443 deschise
- [ ] Node.js și addon instalat în /opt
- [ ] Systemd service activ și pornit
- [ ] NGINX cu SSL și CORS configurat
- [ ] Test curl pe toate endpoint-urile
- [ ] Instalat cu succes în Stremio

## 🧹 Cleanup Automat

Addon-ul include cleanup automat pentru a preveni acumularea de fișiere:

### Ce se curăță automat:
1. **Logs** - Păstrate 48h implicit (configurabil via `LOG_RETENTION_HOURS`)
2. **Fișiere temporare** - Subtitrări extrase, păstrate 48h
3. **Cache** - Păstrat 30 zile pentru performanță
4. **Limite de stocare** - Max 500MB logs, 1GB temp files

### Verificare cleanup:
```bash
# Status timer maintenance
systemctl status stremio-maintenance.timer

# Rulează manual
/opt/stremio-addon/maintenance.sh

# Verifică logs maintenance
journalctl -u stremio-maintenance
```

### Configurare limite în .env:
```bash
LOG_RETENTION_HOURS=48      # Păstrează logs 48 ore
LOG_MAX_SIZE_MB=500         # Max 500MB pentru logs
TEMP_FILE_RETENTION_HOURS=48 # Păstrează temp files 48 ore
TEMP_MAX_SIZE_MB=1000       # Max 1GB pentru temp files
```

## 💡 Tips Hetzner

1. **Snapshots**: Fă snapshot după deploy reușit
2. **Monitoring**: Activează monitoring în Cloud Console
3. **Backup**: Configurează backup automat
4. **IPv6**: Hetzner oferă IPv6 gratis - folosește-l
5. **Firewall**: Nu uita să salvezi rules în Cloud Console
6. **Maintenance**: Verifică periodic cu `./monitoring.sh`

## 🆘 Suport

- **Logs addon**: `journalctl -u stremio-addon -n 100`
- **Status servicii**: `systemctl status stremio-addon nginx`
- **Verificare ports**: `ss -tulpn | grep LISTEN`
- **Test din exterior**: `curl -I https://addon.example.com/health`