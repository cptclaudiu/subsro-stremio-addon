# Addon Stremio pentru Subtitrări Românești

Un addon pentru Stremio care oferă subtitrări în limba română de pe subs.ro - cea mai mare comunitate de subtitrări din România.

## Instalare

### Cerințe sistem
- Node.js 14.0.0 sau mai nou
- npm sau yarn

### Instalare locală
```bash
# Clonează repository-ul
git clone https://github.com/username/subsro-stremio-addon.git
cd subsro-stremio-addon

# Instalează dependențele
npm install

# Pornește serverul
npm start

# Addon-ul va fi disponibil la:
# http://localhost:7000/manifest.json
```

### Instalare în Stremio

1. Deschide Stremio
2. Navighează la secțiunea Addon-uri
3. Click pe "Community Addons" sau "Configure Addons"
4. Adaugă URL-ul addon-ului tău:
   ```
   http://localhost:7000/manifest.json
   ```

## Configurare

### Variabile de mediu

- `PORT` - Portul serverului (implicit: 7000)
- `NODE_ENV` - Mediul de execuție (production/development)

## Cum funcționează

1. **Stremio solicită subtitrări** → Trimite ID-ul IMDB și numele fișierului video
2. **Addon-ul caută pe subs.ro** → Extrage lista de subtitrări pentru filmul/serialul respectiv
3. **Descarcă arhivele** → Preia fișierele ZIP/RAR care conțin subtitrările
4. **Extrage și procesează** → Dezarhivează și detectează codificarea textului
5. **Sortare inteligentă** → Ordonează subtitrările după compatibilitatea cu video-ul tău
6. **Servește către Stremio** → Returnează URL-urile formatate corect

### Potrivire după calitate

Addon-ul sortează inteligent subtitrările bazându-se pe fișierul tău video:
- Potrivirile exacte de nume apar primele
- Tag-urile de calitate identice (BluRay, WEB-DL, etc.) sunt prioritizate
- Maximum 15 subtitrări per tip de calitate pentru a evita aglomerarea

### Tag-uri de calitate suportate

`REMUX`, `BluRay`, `BRRip`, `BDRip`, `WEB-DL`, `WEBRip`, `HDTV`, `HDRip`, `DVDRip`, și altele

## Structura proiectului

```
subsro-stremio-addon/
├── addon-fixed.js          # Server principal și addon Stremio
├── lib/
│   ├── subsRoService.js    # Logica de căutare și procesare subtitrări
│   ├── rarExtractor.js     # Extragere arhive RAR
│   └── logger.js           # Sistem de logging cu auto-curățare
├── temp/                   # Stocare temporară subtitrări
└── logs/                   # Jurnale aplicație (auto-curățate)
```

## Endpoint-uri API

- `GET /manifest.json` - Manifestul addon-ului
- `GET /subtitles/:type/:id.json` - Endpoint căutare subtitrări
- `GET /subtitle/:filename` - Servire fișiere subtitrare
- `GET /health` - Verificare stare server

## Dezvoltare

### Rulare în modul dezvoltare
```bash
npm run dev
```

### Structura codului
- **addon-fixed.js**: Punctul de intrare principal, configurează serverul Express și SDK-ul Stremio
- **lib/subsRoService.js**: Serviciul principal care gestionează căutarea și procesarea subtitrărilor
- **lib/rarExtractor.js**: Modul pentru extragerea arhivelor RAR
- **lib/logger.js**: Sistem de logging cu nivele și rotație automată

## Contribuții

Contribuțiile sunt binevenite! Nu ezitați să trimiteți un Pull Request.

### Ghid pentru contribuitori
1. Fork-uiți repository-ul
2. Creați un branch pentru feature (`git checkout -b feature/AmazingFeature`)
3. Commit-uiți modificările (`git commit -m 'Add some AmazingFeature'`)
4. Push către branch (`git push origin feature/AmazingFeature`)
5. Deschideți un Pull Request

## Licență

Acest proiect este licențiat sub Licența MIT - vezi fișierul [LICENSE](LICENSE) pentru detalii.

## Disclaimer

Acest addon nu este afiliat cu subs.ro. Este un proiect comunitar care ajută utilizatorii români să acceseze subtitrări mai convenabil prin Stremio.

## Suport

Dacă întâmpinați probleme sau aveți sugestii, vă rugăm să deschideți un issue pe GitHub.

---

Creat cu ❤️ pentru comunitatea română Stremio