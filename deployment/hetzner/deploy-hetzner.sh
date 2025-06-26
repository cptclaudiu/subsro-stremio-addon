#!/bin/bash

# Deploy script pentru Stremio Addon pe Hetzner VPS
# Rulează ca root sau cu sudo

set -e  # Exit on error

echo "🚀 Stremio Addon Deploy Script pentru Hetzner VPS"
echo "================================================="

# Verifică dacă suntem root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Te rog rulează ca root sau cu sudo"
    exit 1
fi

# Citește domeniul
read -p "📝 Introdu domeniul tău (ex: addon.example.com): " DOMAIN
read -p "📧 Introdu email pentru Let's Encrypt: " EMAIL

echo ""
echo "🔧 Pas 1: Actualizare sistem..."
apt update && apt full-upgrade -y

echo ""
echo "🔧 Pas 2: Instalare Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git ufw

echo ""
echo "🔧 Pas 3: Instalare NGINX și Certbot..."
apt install -y nginx certbot python3-certbot-nginx

echo ""
echo "🔧 Pas 4: Creare director addon..."
mkdir -p /opt/stremio-addon
cd /opt/stremio-addon

echo ""
echo "🔧 Pas 5: Clonare repository..."
if [ -d ".git" ]; then
    echo "Repository deja clonat, actualizez..."
    git pull
else
    read -p "📦 URL repository Git: " REPO_URL
    git clone $REPO_URL .
fi

echo ""
echo "🔧 Pas 6: Instalare dependențe..."
npm ci --production

echo ""
echo "🔧 Pas 7: Creare fișier .env..."
if [ ! -f .env ]; then
    cp .env.example .env
    sed -i "s|https://your-addon-url.com|https://$DOMAIN|g" .env
    echo "✅ .env creat - verifică configurația!"
fi

echo ""
echo "🔧 Pas 8: Configurare NGINX..."
cat > /etc/nginx/sites-available/stremio-addon <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;  # IPv6 support
    server_name $DOMAIN;

    # SSL certificates (vor fi adăugate de Certbot)
    # ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # Logging
    access_log /var/log/nginx/stremio-addon-access.log;
    error_log /var/log/nginx/stremio-addon-error.log;

    location / {
        proxy_pass http://127.0.0.1:7000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeout 5s pentru Stremio
        proxy_connect_timeout 5s;
        proxy_send_timeout 5s;
        proxy_read_timeout 5s;
        
        # CORS headers - OBLIGATORIU
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Headers "Accept, Content-Type" always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        
        # Content Security
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        
        # Handle preflight
        if (\$request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin "*";
            add_header Access-Control-Allow-Headers "Accept, Content-Type";
            add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
            add_header Content-Length 0;
            add_header Content-Type text/plain;
            return 204;
        }
    }
    
    # Health check fără logs
    location /health {
        proxy_pass http://127.0.0.1:7000/health;
        access_log off;
    }
}
EOF

ln -sf /etc/nginx/sites-available/stremio-addon /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

echo ""
echo "🔧 Pas 9: Test configurare NGINX..."
nginx -t

echo ""
echo "🔧 Pas 10: Restart NGINX..."
systemctl restart nginx

echo ""
echo "🔧 Pas 11: Obținere certificat SSL..."
certbot --nginx -d $DOMAIN --agree-tos -m $EMAIL --redirect --non-interactive

echo ""
echo "🔧 Pas 12: Creare serviciu systemd..."
cat > /etc/systemd/system/stremio-addon.service <<EOF
[Unit]
Description=Stremio subs.ro Addon
Documentation=https://github.com/stremio/stremio-addon-sdk
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/stremio-addon
ExecStart=/usr/bin/node addon-fixed.js
Restart=always
RestartSec=10

# Environment
Environment=NODE_ENV=production
Environment=PORT=7000

# Limits
LimitNOFILE=65536
NoNewPrivileges=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=stremio-addon

[Install]
WantedBy=multi-user.target
EOF

echo ""
echo "🔧 Pas 13: Activare și pornire serviciu..."
systemctl daemon-reload
systemctl enable stremio-addon
systemctl start stremio-addon

echo ""
echo "🔧 Pas 14: Configurare firewall UFW..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "🔧 Pas 15: Verificare servicii..."
sleep 3
systemctl status stremio-addon --no-pager

echo ""
echo "🔧 Pas 16: Configurare cleanup automat..."
# Copiază script-ul de maintenance
cp maintenance.sh /opt/stremio-addon/
chmod +x /opt/stremio-addon/maintenance.sh

# Configurare logrotate
cp logrotate.d-stremio-addon /etc/logrotate.d/stremio-addon

# Configurare systemd timer pentru maintenance
cp systemd-maintenance.* /etc/systemd/system/
systemctl daemon-reload
systemctl enable stremio-maintenance.timer
systemctl start stremio-maintenance.timer

echo ""
echo "✅ DEPLOYMENT COMPLET!"
echo "===================="
echo ""
echo "🔍 Rulare verificări post-deployment..."
echo ""
# Rulează script-ul de verificare dacă există
if [ -f "/opt/stremio-addon/deployment/hetzner/post-deploy-check.sh" ]; then
    /opt/stremio-addon/deployment/hetzner/post-deploy-check.sh
else
    echo "📋 Verificări manuale importante:"
    echo ""
    echo "1. Test manifest:"
    echo "   curl -I https://$DOMAIN/manifest.json"
    echo ""
    echo "2. Test CORS:"
    echo "   curl -I https://$DOMAIN/manifest.json | grep -i access-control"
    echo ""
    echo "3. Test subtitles:"
    echo "   curl https://$DOMAIN/subtitles/movie/tt0111161.json"
    echo ""
    echo "🎉 URL pentru Stremio: https://$DOMAIN/manifest.json"
fi
echo ""
echo "📊 Comenzi utile:"
echo "- Logs: journalctl -u stremio-addon -f"
echo "- Status: systemctl status stremio-addon"
echo "- Health: https://$DOMAIN/health"
echo "- Restart: systemctl restart stremio-addon"
echo ""
echo "⚠️  IMPORTANT: Verifică Hetzner Firewall în Cloud Console!"
echo "   Trebuie să ai reguli pentru porturile 80 și 443"