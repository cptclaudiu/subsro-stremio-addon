#!/bin/bash

# Script monitorizare pentru Stremio Addon pe Hetzner

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

clear

echo "📊 STREMIO ADDON MONITOR"
echo "========================"
echo ""

# Funcție pentru check serviciu
check_service() {
    if systemctl is-active --quiet $1; then
        echo -e "${GREEN}✓${NC} $1 is running"
    else
        echo -e "${RED}✗${NC} $1 is not running"
    fi
}

# 1. Verificare servicii
echo "🔧 SERVICII:"
check_service "stremio-addon"
check_service "nginx"
echo ""

# 2. Verificare porturi
echo "🌐 PORTURI ASCULTARE:"
ss -tulpn | grep -E ':(80|443|7000)' | while read line; do
    port=$(echo $line | grep -oE ':[0-9]+' | head -1 | tr -d ':')
    echo "Port $port: LISTENING"
done
echo ""

# 3. Utilizare resurse
echo "💻 RESURSE SISTEM:"
echo -n "CPU Load: "
uptime | awk -F'load average:' '{print $2}'
echo -n "Memory: "
free -h | grep Mem | awk '{print "Used: " $3 " / Total: " $2}'
echo -n "Disk: "
df -h / | tail -1 | awk '{print "Used: " $3 " / Total: " $2 " (" $5 " full)"}'
echo ""

# 4. Test endpoints
echo "🧪 TEST ENDPOINTS:"
DOMAIN=$(grep PUBLIC_URL /opt/stremio-addon/.env 2>/dev/null | cut -d'=' -f2 | sed 's|https://||')

if [ -z "$DOMAIN" ]; then
    echo -e "${YELLOW}⚠${NC}  Nu pot detecta domeniul din .env"
    echo "   Rulează: curl -I https://YOUR_DOMAIN/health"
else
    # Test health endpoint
    echo -n "Health check: "
    if curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN/health | grep -q "200"; then
        echo -e "${GREEN}✓${NC} OK"
    else
        echo -e "${RED}✗${NC} FAILED"
    fi
    
    # Test manifest
    echo -n "Manifest: "
    if curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN/manifest.json | grep -q "200"; then
        echo -e "${GREEN}✓${NC} OK"
    else
        echo -e "${RED}✗${NC} FAILED"
    fi
    
    # Test CORS
    echo -n "CORS Headers: "
    if curl -sI https://$DOMAIN/manifest.json | grep -qi "access-control-allow-origin"; then
        echo -e "${GREEN}✓${NC} Present"
    else
        echo -e "${RED}✗${NC} Missing!"
    fi
fi
echo ""

# 5. Ultimele erori
echo "🚨 ULTIMELE ERORI (dacă există):"
echo "Addon errors:"
journalctl -u stremio-addon -p err -n 3 --no-pager 2>/dev/null | tail -n +2 || echo "  No errors"
echo ""
echo "NGINX errors:"
tail -3 /var/log/nginx/stremio-addon-error.log 2>/dev/null | grep -v "^$" || echo "  No errors"
echo ""

# 6. Conexiuni active
echo "📡 CONEXIUNI ACTIVE:"
netstat -an | grep -E ':443.*ESTABLISHED' | wc -l | xargs echo "HTTPS connections:"
echo ""

# 7. Certificate SSL
echo "🔒 CERTIFICAT SSL:"
if [ ! -z "$DOMAIN" ]; then
    cert_expiry=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d'=' -f2)
    if [ ! -z "$cert_expiry" ]; then
        echo "Expires: $cert_expiry"
        # Check dacă expiră în 30 zile
        expiry_epoch=$(date -d "$cert_expiry" +%s)
        current_epoch=$(date +%s)
        days_left=$(( ($expiry_epoch - $current_epoch) / 86400 ))
        if [ $days_left -lt 30 ]; then
            echo -e "${YELLOW}⚠${NC}  Certificate expires in $days_left days!"
        else
            echo -e "${GREEN}✓${NC} Certificate valid for $days_left days"
        fi
    else
        echo -e "${RED}✗${NC} Could not check certificate"
    fi
fi
echo ""

echo "========================"
echo "Apasă Ctrl+C pentru a ieși"
echo "Logs: journalctl -u stremio-addon -f"