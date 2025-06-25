const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const features = require('../config/features');

class SeriesCache {
    constructor() {
        this.cacheDir = path.join(__dirname, '..', 'cache', 'series');
        this.cacheTime = features.cacheDuration * 60 * 60 * 1000; // Convert hours to milliseconds
        this.initCache();
    }

    async initCache() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            logger.info('[CACHE] Series cache initialized at:', this.cacheDir);
            
            // Clean old cache on startup
            await this.cleanOldCache();
            
            // Also clean empty cache files
            await this.cleanupEmptyCache();
            
            // Schedule periodic cleanup every 6 hours (since cache lasts 30 days)
            setInterval(() => {
                this.cleanupEmptyCache();
                this.cleanOldCache();
            }, 6 * 60 * 60 * 1000); // 6 hours
        } catch (error) {
            logger.error('[CACHE] Error initializing cache:', error.message);
        }
    }

    getCacheKey(imdbId, season, episode) {
        // Extract series ID without episode info
        const seriesId = imdbId.split(':')[0];
        return `${seriesId}_S${season}_E${episode}`;
    }

    getCachePath(cacheKey) {
        return path.join(this.cacheDir, `${cacheKey}.json`);
    }

    async get(imdbId, season, episode) {
        try {
            const cacheKey = this.getCacheKey(imdbId, season, episode);
            const cachePath = this.getCachePath(cacheKey);
            
            const stats = await fs.stat(cachePath);
            const age = Date.now() - stats.mtime.getTime();
            
            if (age > this.cacheTime) {
                logger.debug(`[CACHE] Cache expired for ${cacheKey}`);
                await fs.unlink(cachePath);
                return null;
            }
            
            const data = await fs.readFile(cachePath, 'utf8');
            const cached = JSON.parse(data);
            
            // Check if cache has valid subtitles (not empty array)
            if (!cached.subtitles || cached.subtitles.length === 0) {
                logger.warning(`[CACHE] Found empty cache for ${cacheKey}, invalidating...`);
                await fs.unlink(cachePath);
                return null;
            }
            
            logger.info(`[CACHE] Hit for ${cacheKey}, age: ${Math.round(age / 1000 / 60)} minutes`);
            return cached.subtitles;
            
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('[CACHE] Error reading cache:', error.message);
            }
            return null;
        }
    }

    async set(imdbId, season, episode, subtitles) {
        try {
            const cacheKey = this.getCacheKey(imdbId, season, episode);
            const cachePath = this.getCachePath(cacheKey);
            
            // IMPORTANT: Never save empty cache
            if (!subtitles || subtitles.length === 0) {
                logger.warning(`[CACHE] Refusing to save empty cache for ${cacheKey}`);
                // If there's an existing cache file with empty data, delete it
                try {
                    await fs.unlink(cachePath);
                    logger.info(`[CACHE] Deleted existing empty cache file for ${cacheKey}`);
                } catch (err) {
                    // File doesn't exist, that's fine
                }
                return;
            }
            
            const cacheData = {
                imdbId,
                season,
                episode,
                subtitles,
                timestamp: Date.now(),
                expiresAt: Date.now() + this.cacheTime
            };
            
            await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2));
            logger.info(`[CACHE] Saved ${cacheKey} with ${subtitles.length} subtitles`);
            
        } catch (error) {
            logger.error('[CACHE] Error writing cache:', error.message);
        }
    }

    async preloadSeason(imdbId, currentSeason, currentEpisode) {
        try {
            const seriesId = imdbId.split(':')[0];
            logger.info(`[CACHE] Preloading season ${currentSeason} for ${seriesId}`);
            
            // Preload next 3 episodes
            const episodesToPreload = [];
            for (let i = 1; i <= 3; i++) {
                const nextEpisode = parseInt(currentEpisode) + i;
                episodesToPreload.push({
                    season: currentSeason,
                    episode: String(nextEpisode).padStart(2, '0')
                });
            }
            
            return episodesToPreload;
        } catch (error) {
            logger.error('[CACHE] Error in preloadSeason:', error.message);
            return [];
        }
    }

    async cleanOldCache() {
        try {
            const files = await fs.readdir(this.cacheDir);
            let cleaned = 0;
            
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                
                const filePath = path.join(this.cacheDir, file);
                const stats = await fs.stat(filePath);
                const age = Date.now() - stats.mtime.getTime();
                
                if (age > this.cacheTime) {
                    await fs.unlink(filePath);
                    cleaned++;
                }
            }
            
            if (cleaned > 0) {
                logger.info(`[CACHE] Cleaned ${cleaned} expired cache files`);
            }
            
        } catch (error) {
            logger.error('[CACHE] Error cleaning cache:', error.message);
        }
    }
    
    async cleanupEmptyCache() {
        try {
            const files = await fs.readdir(this.cacheDir);
            let cleaned = 0;
            
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                
                const filePath = path.join(this.cacheDir, file);
                try {
                    const data = await fs.readFile(filePath, 'utf8');
                    const cached = JSON.parse(data);
                    
                    // Remove cache files with empty subtitles array
                    if (!cached.subtitles || cached.subtitles.length === 0) {
                        await fs.unlink(filePath);
                        cleaned++;
                        logger.debug(`[CACHE] Removed empty cache file: ${file}`);
                    }
                } catch (err) {
                    // Skip files that can't be read
                    continue;
                }
            }
            
            if (cleaned > 0) {
                logger.info(`[CACHE] Cleaned ${cleaned} empty cache files on startup`);
            }
            
        } catch (error) {
            logger.error('[CACHE] Error cleaning empty cache:', error.message);
        }
    }

    // Extract season and episode from video filename or IMDB ID
    extractEpisodeInfo(imdbId, videoFilename) {
        // Try to extract from IMDB ID first (format: tt1234567:2:5)
        const imdbParts = imdbId.split(':');
        if (imdbParts.length === 3) {
            return {
                season: imdbParts[1].padStart(2, '0'),
                episode: imdbParts[2].padStart(2, '0')
            };
        }
        
        // Try to extract from filename
        if (videoFilename) {
            const match = videoFilename.match(/S(\d{1,2})E(\d{1,2})/i);
            if (match) {
                return {
                    season: match[1].padStart(2, '0'),
                    episode: match[2].padStart(2, '0')
                };
            }
        }
        
        return null;
    }

    // Movie cache methods
    getMovieCacheKey(imdbId) {
        return `movie_${imdbId}`;
    }

    async getMovie(imdbId) {
        try {
            const cacheKey = this.getMovieCacheKey(imdbId);
            const cachePath = this.getCachePath(cacheKey);
            
            const stats = await fs.stat(cachePath);
            const age = Date.now() - stats.mtime.getTime();
            
            if (age > this.cacheTime) {
                logger.debug(`[CACHE] Movie cache expired for ${cacheKey}`);
                await fs.unlink(cachePath);
                return null;
            }
            
            const data = await fs.readFile(cachePath, 'utf8');
            const cached = JSON.parse(data);
            
            // Check if cache has valid subtitles (not empty array)
            if (!cached.subtitles || cached.subtitles.length === 0) {
                logger.warning(`[CACHE] Found empty movie cache for ${cacheKey}, invalidating...`);
                await fs.unlink(cachePath);
                return null;
            }
            
            logger.info(`[CACHE] Movie hit for ${cacheKey}, age: ${Math.round(age / 1000 / 60)} minutes`);
            return cached.subtitles;
            
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('[CACHE] Error reading movie cache:', error.message);
            }
            return null;
        }
    }

    async setMovie(imdbId, subtitles) {
        try {
            const cacheKey = this.getMovieCacheKey(imdbId);
            const cachePath = this.getCachePath(cacheKey);
            
            // IMPORTANT: Never save empty cache
            if (!subtitles || subtitles.length === 0) {
                logger.warning(`[CACHE] Refusing to save empty movie cache for ${cacheKey}`);
                // If there's an existing cache file with empty data, delete it
                try {
                    await fs.unlink(cachePath);
                    logger.info(`[CACHE] Deleted existing empty movie cache file for ${cacheKey}`);
                } catch (err) {
                    // File doesn't exist, that's fine
                }
                return;
            }
            
            const cacheData = {
                imdbId,
                type: 'movie',
                subtitles,
                timestamp: Date.now(),
                expiresAt: Date.now() + this.cacheTime
            };
            
            await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2));
            logger.info(`[CACHE] Saved movie ${cacheKey} with ${subtitles.length} subtitles`);
            
        } catch (error) {
            logger.error('[CACHE] Error writing movie cache:', error.message);
        }
    }
}

module.exports = new SeriesCache();