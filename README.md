# Subs.ro Stremio Addon

A Stremio addon that provides Romanian subtitles from subs.ro - the largest Romanian subtitle community.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

## Features

- 🎬 **Automatic subtitle fetching** - Searches and downloads Romanian subtitles from subs.ro
- 🔍 **IMDB integration** - Uses movie/series IMDB ID for accurate matching
- 📦 **Archive extraction** - Automatically extracts ZIP/RAR subtitle archives
- 🎯 **Smart sorting** - Prioritizes subtitles matching your video quality (BluRay, WEB-DL, etc.)
- 🧹 **Self-cleaning** - Automatically removes old files after 5 hours
- 🚫 **Quality filter** - Excludes low-quality CAM/HDCAM releases
- 📊 **Rate limiting** - Prevents server overload with progressive delays
- 🔤 **Encoding detection** - Properly displays Romanian diacritics (ă, â, ț, ș, î)

## Installation

### Option 1: Use Hosted Version (Recommended)

Simply install the addon in Stremio using this URL:
```
https://your-app.onrender.com/manifest.json
```

### Option 2: Self-Host

#### Prerequisites
- Node.js 14.0.0 or higher
- npm or yarn

#### Local Setup
```bash
# Clone the repository
git clone https://github.com/username/subsro-stremio-addon.git
cd subsro-stremio-addon

# Install dependencies
npm install

# Start the server
npm start

# The addon will be available at:
# http://localhost:7000/manifest.json
```

## Deployment

### Deploy to Render.com (Free)

1. Fork this repository to your GitHub account
2. Create an account on [Render.com](https://render.com)
3. Click "New +" → "Web Service"
4. Connect your GitHub repository
5. Use these settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Click "Create Web Service"

Your addon URL will be: `https://[your-app-name].onrender.com/manifest.json`

**Note**: Free Render services sleep after 15 minutes of inactivity. To keep it active 24/7:
1. Sign up at [cron-job.org](https://cron-job.org)
2. Create a job that pings `https://[your-app-name].onrender.com/health` every 14 minutes

### Environment Variables

- `PORT` - Server port (default: 7000)
- `NODE_ENV` - Environment (production/development)

## How It Works

1. **Stremio requests subtitles** → Sends IMDB ID and video filename
2. **Addon searches subs.ro** → Scrapes subtitle listings for that movie/series
3. **Downloads archives** → Fetches ZIP/RAR files containing subtitles
4. **Extracts and processes** → Unpacks archives and detects text encoding
5. **Smart sorting** → Orders subtitles by quality match with your video
6. **Serves to Stremio** → Returns properly formatted subtitle URLs

### Quality Matching

The addon intelligently sorts subtitles based on your video file:
- Exact filename matches appear first
- Same quality tags (BluRay, WEB-DL, etc.) are prioritized
- Maximum 15 subtitles per quality type to avoid clutter

### Supported Quality Tags

`REMUX`, `BluRay`, `BRRip`, `BDRip`, `WEB-DL`, `WEBRip`, `HDTV`, `HDRip`, `DVDRip`, and more

## Architecture

```
subsro-stremio-addon/
├── addon-fixed.js          # Main server and Stremio addon
├── lib/
│   ├── subsRoService.js    # Core subtitle search and processing
│   ├── rarExtractor.js     # RAR archive extraction
│   └── logger.js           # Logging with automatic cleanup
├── temp/                   # Temporary subtitle storage
└── logs/                   # Application logs (auto-cleaned)
```

## API Endpoints

- `GET /manifest.json` - Addon manifest
- `GET /subtitles/:type/:id.json` - Subtitle search endpoint
- `GET /subtitle/:filename` - Serve subtitle files
- `GET /health` - Health check endpoint

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Disclaimer

This addon is not affiliated with subs.ro. It's a community project that helps Romanian users access subtitles more conveniently through Stremio.

## Support

If you encounter any issues or have suggestions, please open an issue on GitHub.

---

Made with ❤️ for the Romanian Stremio community