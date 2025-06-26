#!/usr/bin/env node

const { addonBuilder } = require('stremio-addon-sdk');
const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const path = require('path');
const SubsRoService = require('./lib/subsRoService');
const logger = require('./lib/logger');

logger.info('=== STREMIO SUBS.RO ADDON (FIXED VERSION) ===');

const manifest = {
    id: 'com.stremio.subsro.fixed',
    version: '1.0.4',
    name: 'subs.ro',
    description: 'Romanian subtitles from subs.ro community',
    logo: 'https://cdn.subs.ro/img/logo-flat.png',
    catalogs: [],
    resources: ['subtitles'],
    types: ['movie', 'series'],
    idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);
const subsService = new SubsRoService();

// Define subtitle handler with proper Stremio response format
builder.defineSubtitlesHandler(async ({ type, id, extra }) => {
    const requestId = Date.now();
    logger.info(`[REQ-${requestId}] New subtitle request`, {
        type, id, extra, timestamp: new Date().toISOString()
    });
    
    try {
        // Extract video filename from extra data if available
        const videoFilename = extra?.filename || null;
        
        const subtitles = await subsService.searchSubtitles(id, videoFilename);
        
        // Ensure all subtitles follow Stremio format exactly
        const stremioSubtitles = subtitles.map(sub => ({
            id: sub.id,
            url: sub.url,
            lang: sub.lang
        }));
        
        logger.success(`[REQ-${requestId}] Search completed`, {
            imdbId: id,
            subtitlesFound: stremioSubtitles.length,
            format: 'Stremio-compliant'
        });
        
        return Promise.resolve({ subtitles: stremioSubtitles });
    } catch (error) {
        logger.error(`[REQ-${requestId}] Error fetching subtitles`, {
            error: error.message, stack: error.stack, imdbId: id
        });
        return Promise.resolve({ subtitles: [] });
    }
});

// Create Express app to serve both addon and subtitle files
const app = express();
const PORT = process.env.PORT || 7000;

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

// Rate limiting configuration
const subtitleLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute per IP
    message: 'Too many subtitle requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

const downloadLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 downloads per minute per IP
    message: 'Too many download requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// CORS middleware with configurable origins
app.use((req, res, next) => {
    const allowedOrigins = process.env.CORS_ORIGINS 
        ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
        : ['*'];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

// Serve subtitle files directly with rate limiting
app.get('/subtitle/:filename', downloadLimiter, async (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    logger.info(`[SUBTITLE] Serving file: ${filename}`);
    
    try {
        // Check if this is an extracted real subtitle file
        const tempDir = path.join(__dirname, 'temp');
        const extractedFilePath = path.join(tempDir, filename);
        
        // Try to read the extracted file first
        try {
            let realSrtContent = await fs.readFile(extractedFilePath);
            
            // Detect and convert encoding
            const iconv = require('iconv-lite');
            let encoding = 'utf8';
            
            // Try to detect encoding
            if (Buffer.isBuffer(realSrtContent)) {
                // Check for common Romanian encodings
                const possibleEncodings = ['utf8', 'utf16le', 'cp1250', 'iso-8859-2', 'windows-1250'];
                
                for (const enc of possibleEncodings) {
                    try {
                        const decoded = iconv.decode(realSrtContent, enc);
                        if (!decoded.includes('�') && (decoded.includes('ă') || decoded.includes('â') || decoded.includes('ț') || decoded.includes('ș') || decoded.includes('î'))) {
                            encoding = enc;
                            realSrtContent = decoded;
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                // If no encoding worked, default to cp1250
                if (Buffer.isBuffer(realSrtContent)) {
                    realSrtContent = iconv.decode(realSrtContent, 'cp1250');
                }
            } else {
                // Already string, ensure proper encoding
                realSrtContent = realSrtContent.toString('utf8');
            }
            
            logger.success(`[SUBTITLE] Serving real extracted subtitle: ${filename} (encoding: ${encoding})`);
            
            res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
            res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
            res.setHeader('Cache-Control', 'no-cache');
            res.send(realSrtContent);
            return;
        } catch (err) {
            // File doesn't exist
            logger.error(`[SUBTITLE] File not found: ${filename}`, { error: err.message });
            return res.status(404).send('Subtitle file not found');
        }
        
    } catch (error) {
        logger.error(`[SUBTITLE] Error serving subtitle file: ${error.message}`);
        res.status(500).send('Error serving subtitle file');
    }
});

// Serve manifest
app.get('/manifest.json', (req, res) => {
    logger.info('[MANIFEST] Serving manifest');
    res.setHeader('Content-Type', 'application/json');
    res.json(manifest);
});

// Handle subtitle endpoint with better error handling, timeout and rate limiting
app.get('/subtitles/:type/:id/:extra?.json', subtitleLimiter, async (req, res) => {
    // Set timeout to ensure response within 5 seconds
    const timeout = setTimeout(() => {
        if (!res.headersSent) {
            logger.error('[ENDPOINT] Request timeout after 4.5s');
            res.status(504).json({ error: 'Request timeout' });
        }
    }, 4500); // 4.5s to leave margin
    
    try {
        const { type, id, extra } = req.params;
        logger.info('[ENDPOINT] Subtitle request', { type, id, extra });
        
        let extraParams = {};
        if (extra) {
            const pairs = extra.split('&');
            pairs.forEach(pair => {
                const [key, value] = pair.split('=');
                if (key && value) {
                    extraParams[key] = decodeURIComponent(value);
                }
            });
        }
        
        // Get subtitles from service with video filename
        const videoFilename = extraParams.filename || null;
        const subtitles = await subsService.searchSubtitles(id, videoFilename);
        
        // Ensure Stremio-compliant format
        const stremioSubtitles = subtitles.map(sub => ({
            id: sub.id,
            url: sub.url,
            lang: sub.lang
        }));
        
        const result = { subtitles: stremioSubtitles };
        
        clearTimeout(timeout);
        res.setHeader('Content-Type', 'application/json');
        res.json(result);
    } catch (error) {
        clearTimeout(timeout);
        logger.error('[ENDPOINT] Error', { error: error.message, stack: error.stack });
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

// Comprehensive health check endpoint
app.get('/health', async (req, res) => {
    const healthData = {
        status: 'ok',
        version: manifest.version,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        publicUrl: process.env.PUBLIC_URL || 'http://localhost:7000'
    };
    
    // Check if we can reach subs.ro
    try {
        const axios = require('axios');
        const startTime = Date.now();
        await axios.head('https://subs.ro', { timeout: 5000 });
        healthData.subsRoStatus = 'reachable';
        healthData.subsRoResponseTime = Date.now() - startTime;
    } catch (error) {
        healthData.subsRoStatus = 'unreachable';
        healthData.subsRoError = error.message;
    }
    
    // Check temp directory
    try {
        const tempDir = path.join(__dirname, 'temp');
        const stats = await fs.stat(tempDir);
        healthData.tempDirStatus = stats.isDirectory() ? 'ok' : 'error';
    } catch (error) {
        healthData.tempDirStatus = 'missing';
    }
    
    res.json(healthData);
});

// Proxy status endpoint
app.get('/proxy-status', (req, res) => {
    const proxyRotator = require('./lib/proxyRotator');
    res.json({
        enabled: require('./config/features').useProxies,
        stats: proxyRotator.getStats()
    });
});

app.listen(PORT, () => {
    logger.success(`Fixed addon server started`, {
        port: PORT,
        manifestUrl: `http://localhost:${PORT}/manifest.json`,
        pid: process.pid
    });
    
    console.log(`\n🎬 FIXED ADDON READY!`);
    console.log(`📋 Manifest: http://localhost:${PORT}/manifest.json`);
    console.log(`🔗 Install in Stremio: Copy the manifest URL above`);
    console.log(`✅ Fixed Issues:`);
    console.log(`   - Removed extra 'name' field from subtitle objects`);
    console.log(`   - Using standard ISO 639-2 language code (ron)`);
    console.log(`   - Ensured only id, url, lang fields in response`);
    console.log(`   - Improved CORS headers`);
    console.log(`📊 Logs: tail -f logs/addon-*.log\n`);
});