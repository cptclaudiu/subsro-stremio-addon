# 🚀 Quick Start Guide

## Local Development

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Start addon
npm start
```

Access at: http://localhost:7000/manifest.json

## Production Deployment (Hetzner)

```bash
# On your Hetzner VPS
chmod +x deployment/hetzner/deploy-hetzner.sh
./deployment/hetzner/deploy-hetzner.sh
```

## Production Deployment (Docker)

```bash
# Build and run
docker build -f deployment/docker/Dockerfile -t stremio-subsro .
docker-compose -f deployment/docker/docker-compose.yml up -d
```

## Project Structure

```
├── addon-fixed.js       # Main application
├── lib/                 # Core modules  
├── config/              # Configuration
├── deployment/          # All deployment files
│   ├── docker/         
│   ├── hetzner/        
│   ├── nginx/          
│   └── systemd/        
└── cache/logs/temp/     # Runtime directories
```

## Documentation

- General deployment: `DEPLOYMENT.md`
- Hetzner specific: `deployment/hetzner/HETZNER-DEPLOY.md`
- Environment vars: `.env.example`