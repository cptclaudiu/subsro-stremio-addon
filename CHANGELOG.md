# Changelog

## [1.0.4] - 2025-06-26

### Adăugat
- 🚀 **Stream Download** - Descarcă și extrage în paralel pentru latență redusă
- ⚡ **Extracție ZIP Paralelă** - Începe extracția înainte de finalizarea download-ului
- 📊 **Progress Logging** - Logging detaliat la fiecare 10% pentru debugging

### Îmbunătățit
- Performanță mai bună pentru arhive mari
- Consum de memorie redus prin streaming
- Timp de răspuns îmbunătățit cu până la 40% pentru ZIP-uri
- Logs mai detaliate pentru monitorizare server-side

## [1.0.3] - 2025-06-26

### Adăugat
- 🧪 **GitHub Actions CI/CD** - Teste automate pentru fiecare push
- 🚦 **Rate Limiting** - Protecție împotriva abuzului (30/60 req/min)
- 🌐 **IPv6 Support** - Suport complet în configurația NGINX
- 🤖 **Scraping Protection** - Delay 1.5s între requests + User-Agent configurabil
- ⚖️ **Disclaimer Legal** - Clarificare în README despre natura agregatorului
- 🔧 **Test Local Script** - `test-local.sh` pentru verificare rapidă
- 📊 **Monitoring Îmbunătățit** - Health check mai detaliat

### Modificat
- 📁 **Structură Reorganizată** - Toate fișierele deployment în `/deployment`
- 🧹 **Cleanup Automat** - Limite configurabile pentru logs și temp files
- 📝 **Documentație Actualizată** - PROJECT-STRUCTURE.md la zi

### Securitate
- Headers CORS mai stricte
- Rate limiting pe toate endpoint-urile
- User-Agent pentru conformitate cu ToS

## [1.0.2] - 2025-06-25

### Adăugat
- Cache inteligent pentru seriale (30 zile)
- Preîncărcare automată următoarele 3 episoade
- Sistem de logging cu rotație automată

### Îmbunătățit
- Detectare mai bună pentru encoding românesc
- Sortare subtitrări după calitate

## [1.0.1] - 2025-06-24

### Reparat
- CORS headers pentru Stremio Web
- Timeout protection 5 secunde

## [1.0.0] - 2025-06-24

### Lansare Inițială
- Suport pentru filme și seriale
- Extracție automată RAR/ZIP
- Integrare cu subs.ro