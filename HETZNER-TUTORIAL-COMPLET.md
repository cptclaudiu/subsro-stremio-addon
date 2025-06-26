# 🚀 Tutorial Complet: Deploy Stremio Addon pe Hetzner Cloud

## 📋 Pregătire (5 minute)

### Ce vei avea nevoie:
1. **Cont Hetzner Cloud** cu credit (min €5)
2. **Domeniu** sau subdomeniu (ex: `addon.domeniul-tau.ro`)
3. **Email** pentru certificat SSL
4. **GitHub account** (opțional, pentru clone)

---

## 🖥️ Pasul 1: Creează Server în Hetzner Console

### 1.1 Intră în Hetzner Cloud Console
```
https://console.hetzner.cloud/
```

### 1.2 Creează Proiect Nou (dacă nu ai)
- Click pe **"New Project"**
- Nume: `stremio-addon` (sau ce vrei tu)
- Click **"Create"**

### 1.3 Creează Server
1. Click pe **"Add Server"** (buton roșu)

2. **Location**: 
   - Alege **Falkenstein** sau **Nuremberg** (Germania)
   - Mai ieftin și GDPR compliant

3. **Image**:
   - Selectează **Ubuntu 22.04**

4. **Type**:
   - Alege **CX22** (2 vCPU, 4GB RAM)
   - Suficient pentru addon + headroom

5. **Volume**: 
   - Nu e necesar (Skip)

6. **Network**:
   - Lasă default (Public IPv4 + IPv6)

7. **Firewall**:
   - **IMPORTANT**: Selectează **"Create & Apply Firewall"**
   - Nume: `stremio-firewall`
   - Rules vor fi:
     ```
     SSH     - Port 22   - Source: 0.0.0.0/0
     HTTP    - Port 80   - Source: 0.0.0.0/0
     HTTPS   - Port 443  - Source: 0.0.0.0/0
     ```

8. **SSH Keys**:
   - **Recomandat**: Adaugă SSH key pentru securitate
   - SAU: Vei primi parola pe email

9. **Name**:
   - Server name: `stremio-addon-1`

10. Click **"Create & Buy now"** (~€5.83/lună)

### 1.4 Așteaptă să pornească
- ~30 secunde până e Ready
- Notează **IP-ul public** (ex: `65.108.123.45`)

---

## 🌐 Pasul 2: Configurează DNS

### 2.1 Du-te la provider-ul tău DNS
(Cloudflare, Namecheap, etc.)

### 2.2 Adaugă A Record
```
Type: A
Name: addon (sau @ pentru domeniu principal)
Value: 65.108.123.45 (IP-ul serverului tău)
TTL: 5 min (sau Auto)
```

### 2.3 Verifică DNS (opțional)
```bash
# Pe PC-ul tău local:
nslookup addon.domeniul-tau.ro

# Trebuie să vezi IP-ul serverului
```

---

## 🔐 Pasul 3: Conectează-te la Server

### 3.1 Deschide Terminal/PuTTY

### Pentru Windows (PowerShell):
```powershell
ssh root@65.108.123.45
```

### Pentru Mac/Linux:
```bash
ssh root@65.108.123.45
```

### 3.2 Acceptă fingerprint
Tastează `yes` când întreabă despre authenticity

### 3.3 Introdu parola
(primită pe email sau folosește SSH key)

---

## 📦 Pasul 4: Pregătește Serverul

### 4.1 Actualizează sistemul
```bash
apt update && apt upgrade -y
```
⏱️ ~2 minute

### 4.2 Instalează unelte de bază
```bash
apt install -y curl git wget nano
```

### 4.3 Setează timezone (opțional)
```bash
timedatectl set-timezone Europe/Bucharest
```

---

## 🎯 Pasul 5: Descarcă și Rulează Script-ul de Deployment

### 5.1 Clonează repository-ul
```bash
cd /opt
git clone https://github.com/USERNAME/subsro-stremio-addon.git stremio-addon
cd stremio-addon
```

**SAU** dacă nu ai pe GitHub, uploadează manual:
```bash
# Pe PC-ul tău local, în folderul proiectului:
scp -r ./* root@65.108.123.45:/opt/stremio-addon/
```

### 5.2 Navigează la scriptul de deployment
```bash
cd /opt/stremio-addon/deployment/hetzner
```

### 5.3 Fă scriptul executabil
```bash
chmod +x deploy-hetzner.sh
chmod +x post-deploy-check.sh
```

### 5.4 Rulează deployment-ul
```bash
./deploy-hetzner.sh
```

### 5.5 Când îți cere informații, introdu:
```
🔧 Configurare inițială
======================

Introdu domeniul pentru addon (ex: addon.example.com): addon.domeniul-tau.ro
Introdu email pentru Let's Encrypt: email@tau.com
Introdu URL-ul repository-ului Git: [Enter pentru skip dacă ai uploadat manual]
```

---

## ⏳ Pasul 6: Așteaptă Instalarea (~5-10 minute)

Script-ul va face automat:
1. ✅ Instalează Node.js 18
2. ✅ Instalează NGINX
3. ✅ Instalează Certbot
4. ✅ Configurează aplicația
5. ✅ Obține certificat SSL
6. ✅ Pornește serviciul

### Vezi progresul:
```
🔧 Pas 1: Verificare sistem...
✓ Ubuntu 22.04 detectat

🔧 Pas 2: Instalare Node.js 18...
[...]

🔧 Pas 11: Obținere certificat SSL...
✓ Certificat obținut cu succes!

✅ DEPLOYMENT COMPLET!
```

---

## 🔍 Pasul 7: Verifică Deployment-ul

### 7.1 Rulează verificarea automată
```bash
./post-deploy-check.sh
```

### Trebuie să vezi:
```
🔍 Post-Deployment Verification pentru Stremio Addon
==================================================

✅ PUBLIC_URL setat: https://addon.domeniul-tau.ro
✅ Certificat SSL valid
✅ Redirect HTTP → HTTPS funcționează
✅ Manifest accesibil
✅ CORS headers prezente
✅ Endpoint subtitrări funcțional
✅ Serviciul stremio-addon rulează

✨ SUCCES! Addon-ul este gata pentru Stremio!
============================================

📌 URL pentru instalare în Stremio:
   https://addon.domeniul-tau.ro/manifest.json
```

### 7.2 Test manual în browser
Deschide:
- `https://addon.domeniul-tau.ro/health`
- `https://addon.domeniul-tau.ro/manifest.json`

---

## 📱 Pasul 8: Instalează în Stremio

### Desktop:
1. Deschide **Stremio**
2. Click pe **Puzzle icon** (sus dreapta)
3. **Community Addons**
4. **Install from URL**
5. Paste: `https://addon.domeniul-tau.ro/manifest.json`
6. Click **Install**

### Android/iOS:
1. Deschide **Stremio**
2. **Settings** → **Addons**
3. Scroll jos → **Install from URL**
4. Paste URL-ul
5. **Install**

---

## 🛠️ Pasul 9: Monitorizare și Mentenanță

### 9.1 Vezi logs în timp real
```bash
journalctl -u stremio-addon -f
```
(Ctrl+C pentru exit)

### 9.2 Verifică status
```bash
systemctl status stremio-addon
```

### 9.3 Restart manual (dacă e nevoie)
```bash
systemctl restart stremio-addon
```

### 9.4 Monitorizare live
```bash
cd /opt/stremio-addon/deployment
./monitoring.sh
```

---

## 🚨 Troubleshooting

### Problema 1: "Nu pot accesa addon-ul"
```bash
# Verifică serviciul
systemctl status stremio-addon

# Verifică NGINX
systemctl status nginx

# Verifică firewall Hetzner în Console
```

### Problema 2: "Certificate error"
```bash
# Re-generează certificat
certbot --nginx -d addon.domeniul-tau.ro
```

### Problema 3: "Nu găsește subtitrări"
```bash
# Verifică logs
journalctl -u stremio-addon -n 100

# Verifică conectivitatea la subs.ro
curl -I https://subs.ro
```

### Problema 4: "CORS error în Stremio"
```bash
# Verifică headers
curl -I https://addon.domeniul-tau.ro/manifest.json | grep -i access-control

# Restart NGINX
systemctl restart nginx
```

---

## 📊 Statistici și Costuri

### Server CX22:
- **Cost**: €5.83/lună (~29 RON)
- **CPU**: 2 vCore
- **RAM**: 4 GB
- **Storage**: 40 GB SSD
- **Traffic**: 20 TB (mai mult decât suficient)

### Performanță așteptată:
- ~100 utilizatori simultani
- Response time <2 secunde
- Uptime 99.9%

---

## 🔒 Securitate Adițională (Opțional)

### 1. Schimbă port SSH
```bash
nano /etc/ssh/sshd_config
# Schimbă: Port 22 → Port 2222
systemctl restart sshd
```

### 2. Instalează Fail2ban
```bash
apt install fail2ban -y
systemctl enable fail2ban
```

### 3. Activează UFW firewall
```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

---

## 🎉 Felicitări!

Addon-ul tău Stremio rulează acum pe Hetzner Cloud!

### Link-uri utile:
- **Addon URL**: `https://addon.domeniul-tau.ro/manifest.json`
- **Health Check**: `https://addon.domeniul-tau.ro/health`
- **Logs**: `journalctl -u stremio-addon -f`

### Comenzi importante:
```bash
# Restart addon
systemctl restart stremio-addon

# Vezi logs
journalctl -u stremio-addon -f

# Update addon
cd /opt/stremio-addon
git pull
npm install
systemctl restart stremio-addon
```

---

**💡 Pro Tip**: Salvează acest tutorial și URL-ul addon-ului!