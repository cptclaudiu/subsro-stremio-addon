#!/bin/bash

# Post-deployment verification script for Stremio addon
# Ensures everything is properly configured for Stremio

echo "🔍 Post-Deployment Verification pentru Stremio Addon"
echo "=================================================="

# Verifică dacă .env există și are PUBLIC_URL
if [ ! -f /opt/stremio-addon/.env ]; then
    echo "❌ EROARE: Fișierul .env nu există!"
    echo "👉 Creează .env din .env.example și setează PUBLIC_URL"
    exit 1
fi

PUBLIC_URL=$(grep "^PUBLIC_URL=" /opt/stremio-addon/.env | cut -d'=' -f2)
if [ -z "$PUBLIC_URL" ]; then
    echo "❌ EROARE: PUBLIC_URL nu este setat în .env!"
    echo "👉 Adaugă PUBLIC_URL=https://domeniul-tau.com în .env"
    exit 1
fi

echo "✅ PUBLIC_URL setat: $PUBLIC_URL"

# Verifică certificatul SSL
echo ""
echo "🔐 Verificare certificat SSL..."
if echo | openssl s_client -servername ${PUBLIC_URL#https://} -connect ${PUBLIC_URL#https://}:443 2>/dev/null | openssl x509 -noout -dates; then
    echo "✅ Certificat SSL valid"
else
    echo "❌ EROARE: Certificat SSL invalid sau lipsește!"
    echo "👉 Rulează: certbot --nginx -d ${PUBLIC_URL#https://}"
    exit 1
fi

# Test HTTPS redirect
echo ""
echo "🔄 Test redirect HTTP → HTTPS..."
HTTP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -L http://${PUBLIC_URL#https://})
if [ "$HTTP_RESPONSE" = "200" ]; then
    echo "✅ Redirect HTTP → HTTPS funcționează"
else
    echo "⚠️  ATENȚIE: Redirect HTTP → HTTPS poate avea probleme (cod: $HTTP_RESPONSE)"
fi

# Test manifest.json
echo ""
echo "📋 Verificare manifest.json..."
MANIFEST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$PUBLIC_URL/manifest.json")
if [ "$MANIFEST_RESPONSE" = "200" ]; then
    echo "✅ Manifest accesibil"
    
    # Verifică CORS headers
    CORS_HEADER=$(curl -s -I "$PUBLIC_URL/manifest.json" | grep -i "access-control-allow-origin")
    if [ -n "$CORS_HEADER" ]; then
        echo "✅ CORS headers prezente: $CORS_HEADER"
    else
        echo "❌ EROARE: CORS headers lipsesc!"
        echo "👉 Verifică configurarea NGINX și Express"
        exit 1
    fi
else
    echo "❌ EROARE: Manifest inaccesibil (cod: $MANIFEST_RESPONSE)"
    exit 1
fi

# Test endpoint subtitrări
echo ""
echo "🎬 Test endpoint subtitrări..."
SUBTITLE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$PUBLIC_URL/subtitles/movie/tt0111161.json")
if [ "$SUBTITLE_RESPONSE" = "200" ]; then
    echo "✅ Endpoint subtitrări funcțional"
else
    echo "⚠️  ATENȚIE: Endpoint subtitrări returnează cod $SUBTITLE_RESPONSE"
fi

# Verifică serviciul systemd
echo ""
echo "🚀 Verificare serviciu systemd..."
if systemctl is-active --quiet stremio-addon; then
    echo "✅ Serviciul stremio-addon rulează"
else
    echo "❌ EROARE: Serviciul stremio-addon nu rulează!"
    echo "👉 Rulează: systemctl start stremio-addon"
    exit 1
fi

# Generează URL-ul pentru Stremio
echo ""
echo "✨ SUCCES! Addon-ul este gata pentru Stremio!"
echo "============================================"
echo ""
echo "📌 URL pentru instalare în Stremio:"
echo "   $PUBLIC_URL/manifest.json"
echo ""
echo "🔧 Pentru a adăuga în Stremio:"
echo "   1. Deschide Stremio"
echo "   2. Settings → Addons → Community Addons"
echo "   3. Paste URL-ul de mai sus"
echo ""
echo "💡 Sfaturi:"
echo "   - Asigură-te că folosești HTTPS, nu HTTP"
echo "   - Verifică logs: journalctl -u stremio-addon -f"
echo "   - Monitor: $PUBLIC_URL/health"