#!/bin/bash

# Script de testare locală rapidă

echo "🧪 Test Local Stremio Addon"
echo "=========================="

# Check if server is running
if ! curl -s http://localhost:7000/health > /dev/null; then
    echo "❌ Server nu rulează! Pornește cu: npm start"
    exit 1
fi

echo ""
echo "1️⃣ Test Manifest:"
curl -s http://localhost:7000/manifest.json | jq -C '.'

echo ""
echo "2️⃣ Test CORS Headers:"
curl -I http://localhost:7000/manifest.json 2>/dev/null | grep -i "access-control" | head -3

echo ""
echo "3️⃣ Test Health:"
curl -s http://localhost:7000/health | jq -C '.'

echo ""
echo "4️⃣ Test Subtitle Search (The Matrix):"
curl -s http://localhost:7000/subtitles/movie/tt0133093.json | jq -C '.subtitles | length'

echo ""
echo "5️⃣ Test Response Time:"
time curl -s http://localhost:7000/subtitles/movie/tt0111161.json > /dev/null

echo ""
echo "✅ Teste complete! Pentru instalare în Stremio:"
echo "   http://localhost:7000/manifest.json"