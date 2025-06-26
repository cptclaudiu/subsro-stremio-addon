const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const RarExtractor = require('./rarExtractor');
const StreamExtractor = require('./streamExtractor');
const logger = require('./logger');
const proxyRotator = require('./proxyRotator');
const seriesCache = require('./seriesCache');
const features = require('../config/features');
const EpisodeExtractor = require('./episodeExtractor');

class SubsRoService {
    // Quality tags in priority order (REMUX moved to lower priority)
    static QUALITY_TAGS = [
        'BluRay', 'BRRip', 'BDRip', 'WEB-DL', 'WEBDLRip', 'WEBRip', 
        'HDTV', 'HDRip', 'DVDRip', 'REMUX', 'WEB', 'NF', 'AMZN', 'DSNP', 
        'HMAX', 'HULU', 'APLTV', 'iTunes', 'HBO', 'HBO MAX'
    ];

    constructor() {
        this.baseUrl = 'https://subs.ro';
        this.searchUrl = `${this.baseUrl}/ajax/search`;
        this.tempDir = path.join(__dirname, '../temp');
        this.rarExtractor = new RarExtractor();
        this.streamExtractor = new StreamExtractor();
        this.publicUrl = process.env.PUBLIC_URL || 'http://localhost:7000';
        this.useStreamDownload = process.env.ENABLE_STREAM_DOWNLOAD !== 'false'; // Enabled by default
        this.ensureTempDir();
        this.startCleanupInterval(); // Start automatic cleanup
        logger.info('SubsRoService initialized', {
            baseUrl: this.baseUrl,
            tempDir: this.tempDir,
            publicUrl: this.publicUrl,
            features: {
                proxies: features.useProxies,
                cache: features.useSeriesCache,
                preload: features.preloadNextEpisodes
            }
        });
        
        // Log proxy status
        if (features.useProxies) {
            logger.info('[SUBSRO] Proxy rotation enabled with ProxyRotator');
            const stats = proxyRotator.getStats();
            logger.info('[SUBSRO] Proxy stats:', stats);
        }
    }

    extractQualityTag(filename) {
        const upperFilename = filename.toUpperCase();
        for (const tag of SubsRoService.QUALITY_TAGS) {
            if (upperFilename.includes(tag.toUpperCase())) {
                return tag;
            }
        }
        return null;
    }

    normalizeFilename(filename) {
        // Remove extension and common separators
        return filename
            .replace(/\.(mp4|mkv|avi|mov|srt|sub|ass|ssa|vtt)$/i, '')
            .replace(/[._\-\s]+/g, ' ')
            .toLowerCase()
            .trim();
    }

    extractEpisodePattern(filename) {
        if (!filename) return null;
        
        // Extract S##E## pattern (case insensitive)
        const episodeMatch = filename.match(/[sS](\d{1,2})[eE](\d{1,2})/);
        if (episodeMatch) {
            const season = episodeMatch[1].padStart(2, '0');
            const episode = episodeMatch[2].padStart(2, '0');
            return `S${season}E${episode}`;
        }
        
        return null;
    }

    checkExactMatch(subtitleFilename, videoFilename) {
        if (!videoFilename) return false;
        
        const normalizedSub = this.normalizeFilename(subtitleFilename);
        const normalizedVideo = this.normalizeFilename(videoFilename);
        
        // Check if they are identical or very similar
        return normalizedSub === normalizedVideo || 
               normalizedSub.includes(normalizedVideo) || 
               normalizedVideo.includes(normalizedSub);
    }

    sortSubtitlesByQuality(subtitles, videoFilename) {
        const videoTag = videoFilename ? this.extractQualityTag(videoFilename) : null;
        
        if (videoTag) {
            logger.info(`[SORT] Video file tag detected: ${videoTag} from filename: ${videoFilename}`);
        }
        
        return subtitles.sort((a, b) => {
            // Extract original filenames from URLs
            const filenameA = decodeURIComponent(a.url.split('/').pop());
            const filenameB = decodeURIComponent(b.url.split('/').pop());
            
            // 1. Exact match with video filename gets highest priority
            const exactMatchA = this.checkExactMatch(filenameA, videoFilename);
            const exactMatchB = this.checkExactMatch(filenameB, videoFilename);
            
            if (exactMatchA && !exactMatchB) return -1;
            if (!exactMatchA && exactMatchB) return 1;
            
            // 2. Matching quality tag gets second priority - THIS IS THE KEY PART
            const tagA = this.extractQualityTag(filenameA);
            const tagB = this.extractQualityTag(filenameB);
            
            const matchesVideoTagA = videoTag && tagA && tagA.toUpperCase() === videoTag.toUpperCase();
            const matchesVideoTagB = videoTag && tagB && tagB.toUpperCase() === videoTag.toUpperCase();
            
            // If video has a tag, prioritize ALL subtitles with same tag
            if (matchesVideoTagA && !matchesVideoTagB) return -1;
            if (!matchesVideoTagA && matchesVideoTagB) return 1;
            
            // 3. Only then sort by quality tag priority
            const indexA = tagA ? SubsRoService.QUALITY_TAGS.indexOf(tagA) : 999;
            const indexB = tagB ? SubsRoService.QUALITY_TAGS.indexOf(tagB) : 999;
            
            return indexA - indexB;
        });
    }

    async ensureTempDir() {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
        } catch (error) {
            console.error('Error creating temp directory:', error);
        }
    }

    startCleanupInterval() {
        // Run cleanup every 6 hours (since we keep files for 30 days)
        setInterval(() => {
            this.cleanupOldFiles();
        }, 6 * 60 * 60 * 1000); // 6 hours
        
        // Also run cleanup on startup
        this.cleanupOldFiles();
    }

    async cleanupOldFiles() {
        try {
            const files = await fs.readdir(this.tempDir);
            const now = Date.now();
            const maxAge = parseInt(process.env.TEMP_FILE_RETENTION_HOURS || '48') * 60 * 60 * 1000; // Default 48 hours
            const oldThreshold = now - maxAge;
            const maxDirSize = parseInt(process.env.TEMP_MAX_SIZE_MB || '1000') * 1024 * 1024; // Default 1GB
            
            let deletedCount = 0;
            let totalSize = 0;
            const fileStats = [];
            
            // Gather file stats
            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                try {
                    const stats = await fs.stat(filePath);
                    totalSize += stats.size;
                    fileStats.push({ path: filePath, mtime: stats.mtime, size: stats.size });
                    
                    // Check if file is older than retention period
                    if (stats.mtime.getTime() < oldThreshold) {
                        await fs.unlink(filePath);
                        deletedCount++;
                        totalSize -= stats.size;
                    }
                } catch (err) {
                    // Skip files that can't be accessed
                    continue;
                }
            }
            
            // If still over size limit, delete oldest files
            if (totalSize > maxDirSize) {
                const sortedFiles = fileStats
                    .filter(f => fs.existsSync(f.path)) // Only existing files
                    .sort((a, b) => a.mtime - b.mtime); // Oldest first
                
                while (totalSize > maxDirSize && sortedFiles.length > 0) {
                    const oldest = sortedFiles.shift();
                    try {
                        await fs.unlink(oldest.path);
                        totalSize -= oldest.size;
                        deletedCount++;
                    } catch (err) {
                        // File might be in use
                    }
                }
            }
            
            if (deletedCount > 0) {
                logger.info(`[CLEANUP] Deleted ${deletedCount} subtitle files (retention: ${process.env.TEMP_FILE_RETENTION_HOURS || '48'}h, size limit: ${process.env.TEMP_MAX_SIZE_MB || '1000'}MB)`);
            }
        } catch (error) {
            logger.error('[CLEANUP] Error during cleanup', { error: error.message });
        }
    }

    limitSubtitlesPerTag(subtitles, maxPerTag) {
        const tagCounts = {};
        const limitedSubtitles = [];
        const removedCamCount = { HDCAM: 0, CAM: 0 };
        
        for (const subtitle of subtitles) {
            // Extract tag from subtitle filename
            const filename = decodeURIComponent(subtitle.url.split('/').pop());
            const tag = this.extractQualityTag(filename) || 'UNKNOWN';
            
            // Skip HDCAM and CAM subtitles
            if (filename.toUpperCase().includes('HDCAM') || filename.toUpperCase().includes('CAM')) {
                // Track removed CAM subtitles for logging
                if (filename.toUpperCase().includes('HDCAM')) {
                    removedCamCount.HDCAM++;
                } else if (filename.toUpperCase().includes('CAM')) {
                    removedCamCount.CAM++;
                }
                continue;
            }
            
            // Initialize count for this tag if not exists
            if (!tagCounts[tag]) {
                tagCounts[tag] = 0;
            }
            
            // Add subtitle if under the limit for this tag
            if (tagCounts[tag] < maxPerTag) {
                limitedSubtitles.push(subtitle);
                tagCounts[tag]++;
            }
        }
        
        // Enhanced logging
        logger.info('[LIMIT] Subtitle distribution by tag:', {
            tagCounts: tagCounts,
            totalBefore: subtitles.length,
            totalAfter: limitedSubtitles.length,
            removedCount: subtitles.length - limitedSubtitles.length,
            removedCAM: removedCamCount
        });
        
        return limitedSubtitles;
    }

    generateAntispam() {
        return crypto.randomBytes(20).toString('hex');
    }

    async preloadNextEpisodes(seriesId, season, currentEpisode, videoFilename) {
        try {
            const episodesToPreload = await seriesCache.preloadSeason(seriesId, season, currentEpisode);
            
            logger.info(`[PRELOAD] Starting background preload for ${episodesToPreload.length} episodes`);
            
            // Preload in background without blocking
            setImmediate(async () => {
                for (const episode of episodesToPreload) {
                    const imdbIdWithEpisode = `${seriesId}:${parseInt(season)}:${parseInt(episode.episode)}`;
                    const fakeFilename = `Series.S${episode.season}E${episode.episode}.mkv`;
                    
                    // Check if already cached
                    const cached = await seriesCache.get(imdbIdWithEpisode, episode.season, episode.episode);
                    if (!cached) {
                        logger.info(`[PRELOAD] Preloading S${episode.season}E${episode.episode}`);
                        // Search without waiting for result
                        this.searchSubtitles(imdbIdWithEpisode, fakeFilename).catch(err => {
                            logger.error(`[PRELOAD] Error preloading episode: ${err.message}`);
                        });
                        
                        // Wait between preloads to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
            });
        } catch (error) {
            logger.error('[PRELOAD] Error in preloadNextEpisodes:', error.message);
        }
    }

    async searchSubtitles(imdbId, videoFilename = null) {
        const searchId = Date.now();
        logger.info(`[SEARCH-${searchId}] Starting subtitle search`, { imdbId });
        
        try {
            // Check cache for both series and movies
            const episodeInfo = seriesCache.extractEpisodeInfo(imdbId, videoFilename);
            
            // For series episodes
            if (features.useSeriesCache && episodeInfo) {
                const cachedSubtitles = await seriesCache.get(imdbId, episodeInfo.season, episodeInfo.episode);
                if (cachedSubtitles) {
                    logger.success(`[SEARCH-${searchId}] Returning cached subtitles for S${episodeInfo.season}E${episodeInfo.episode}`);
                    return cachedSubtitles;
                }
            } 
            // For movies (no episode info)
            else if (features.useSeriesCache && !imdbId.includes(':')) {
                const cachedSubtitles = await seriesCache.getMovie(imdbId);
                if (cachedSubtitles) {
                    logger.success(`[SEARCH-${searchId}] Returning cached movie subtitles for ${imdbId}`);
                    return cachedSubtitles;
                }
            }
            
            // Extract clean IMDB ID (remove series episode info like :4:6)
            const cleanImdbId = imdbId.split(':')[0];
            
            // First, let's try searching by IMDB ID directly on the listing page
            const listUrl = `${this.baseUrl}/subtitrari/imdbid/${cleanImdbId.replace('tt', '')}`;
            logger.debug(`[SEARCH-${searchId}] Fetching URL: ${listUrl}`);
            
            // Add delay to respect subs.ro
            if (this.lastRequestTime) {
                const timeSinceLastRequest = Date.now() - this.lastRequestTime;
                const minDelay = parseInt(process.env.SCRAPING_DELAY_MS || '1500'); // 1.5s default
                if (timeSinceLastRequest < minDelay) {
                    await new Promise(resolve => setTimeout(resolve, minDelay - timeSinceLastRequest));
                }
            }
            this.lastRequestTime = Date.now();
            
            const response = await axios.get(listUrl, {
                headers: {
                    'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 StremioAddon/1.0',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
                    'Referer': this.baseUrl
                },
                timeout: 10000
            });

            logger.debug(`[SEARCH-${searchId}] Response received`, {
                status: response.status,
                contentLength: response.data.length
            });

            const $ = cheerio.load(response.data);
            const subtitles = [];
            
            const gridElements = $('.grid');
            logger.info(`[SEARCH-${searchId}] Found ${gridElements.length} subtitle entries on page`);

            $('.grid').each((index, element) => {
                const $elem = $(element);
                const titleElem = $elem.find('h1 a').first();
                const title = titleElem.text().trim() || titleElem.attr('title') || 'Unknown';
                const downloadLink = $elem.find('a[href*="/subtitrare/descarca/"]').attr('href');
                const translatorText = $elem.find('p:contains("Traducător")').text();
                const translator = translatorText.split(':')[1]?.trim() || '';
                const downloads = $elem.find('p:contains("Descărcări")').text().replace('Descărcări:', '').replace(',', '').trim();
                const comment = $elem.find('.bg-\\[\\#f4f3e9\\] p').text().trim();
                const language = $elem.find('img[alt*="Subtitrare"]').attr('alt');
                const isRomanian = !language || language.includes('- ro');
                
                if (downloadLink && isRomanian) {
                    const subtitleId = `subsro_${index}_${cleanImdbId}`;
                    const cleanTitle = title.replace(/\s+\(\d{4}\)/, '');
                    const version = comment.match(/([^,;]+(?:720p|1080p|BluRay|WEB-DL|BRRip|DVDRip|HDTV)[^,;]*)/i)?.[1]?.trim() || '';
                    
                    const subtitle = {
                        id: subtitleId,
                        url: downloadLink.startsWith('http') ? downloadLink : `${this.baseUrl}${downloadLink}`,
                        lang: 'ron',  // ISO 639-2/T code for Romanian
                    };
                    
                    subtitles.push(subtitle);
                    
                    logger.debug(`[SEARCH-${searchId}] Found subtitle #${index + 1}`, {
                        title,
                        downloadLink,
                        translator,
                        version,
                        subtitle
                    });
                }
            });

            logger.success(`[SEARCH-${searchId}] Search completed`, {
                imdbId: cleanImdbId,
                totalFound: subtitles.length
            });
            
            // Pre-filter subtitles by episode pattern if available
            let subtitlesToProcess = subtitles;
            const videoEpisodePattern = EpisodeExtractor.extractFromMultipleSources(imdbId, videoFilename);
            
            if (videoEpisodePattern && subtitles.length > 0) {
                logger.info(`[SEARCH-${searchId}] Pre-filtering subtitles for episode: ${videoEpisodePattern}`);
                
                // Filter subtitles based on title/comment containing episode pattern
                subtitlesToProcess = subtitles.filter((subtitle, index) => {
                    // Get the original grid element to check title and comment
                    const gridElement = $('.grid').eq(index);
                    const title = gridElement.find('h1 a').first().text().trim();
                    const comment = gridElement.find('.bg-\\[\\#f4f3e9\\] p').text().trim();
                    const combinedText = `${title} ${comment}`.toUpperCase();
                    
                    // Check if title or comment contains the episode pattern
                    const episodeRegex = new RegExp(videoEpisodePattern.replace('S', '[Ss]').replace('E', '[Ee]'), 'i');
                    const seasonOnly = videoEpisodePattern.match(/S(\d{2})/)?.[0];
                    
                    return episodeRegex.test(combinedText) || 
                           (seasonOnly && combinedText.includes(seasonOnly.toUpperCase())) ||
                           (seasonOnly && combinedText.includes(`SEASON ${parseInt(seasonOnly.slice(1))}`));
                });
                
                logger.info(`[SEARCH-${searchId}] Pre-filtered to ${subtitlesToProcess.length} subtitles from ${subtitles.length} total`);
                
                // If no matches found, try season-only matches
                if (subtitlesToProcess.length === 0 && seasonOnly) {
                    subtitlesToProcess = subtitles.filter((subtitle, index) => {
                        const gridElement = $('.grid').eq(index);
                        const title = gridElement.find('h1 a').first().text().trim();
                        const comment = gridElement.find('.bg-\\[\\#f4f3e9\\] p').text().trim();
                        const combinedText = `${title} ${comment}`.toUpperCase();
                        
                        return combinedText.includes('COMPLET') || combinedText.includes('PACK');
                    });
                    logger.info(`[SEARCH-${searchId}] Found ${subtitlesToProcess.length} season pack subtitles`);
                }
            }
            
            // Process only the filtered subtitles
            const processedSubtitles = await this.processSubtitles(subtitlesToProcess);
            
            // Filter by episode if video filename contains episode pattern
            let filteredSubtitles = processedSubtitles;
            const videoEpisodePattern = EpisodeExtractor.extractFromMultipleSources(imdbId, videoFilename);
            
            if (videoEpisodePattern) {
                logger.info(`[SEARCH-${searchId}] Filtering for episode: ${videoEpisodePattern}`);
                
                // First, try to find exact episode matches
                let exactMatches = processedSubtitles.filter(subtitle => {
                    const subtitleFilename = decodeURIComponent(subtitle.url.split('/').pop());
                    return EpisodeExtractor.subtitleMatchesEpisode(subtitleFilename, videoEpisodePattern);
                });
                
                if (exactMatches.length > 0) {
                    filteredSubtitles = exactMatches;
                    logger.info(`[SEARCH-${searchId}] Found ${exactMatches.length} subtitles for ${videoEpisodePattern}`);
                } else {
                    // If no exact matches, look for season packs that might contain this episode
                    const seasonPattern = videoEpisodePattern.match(/S(\d{2})/)?.[0];
                    if (seasonPattern) {
                        const seasonMatches = processedSubtitles.filter(subtitle => {
                            const subtitleFilename = decodeURIComponent(subtitle.url.split('/').pop());
                            return subtitleFilename.includes(seasonPattern) || 
                                   subtitleFilename.includes(`Season ${parseInt(seasonPattern.slice(1))}`);
                        });
                        
                        if (seasonMatches.length > 0) {
                            filteredSubtitles = seasonMatches;
                            logger.info(`[SEARCH-${searchId}] Found ${seasonMatches.length} season pack subtitles for ${seasonPattern}`);
                        }
                    }
                }
                
                logger.info(`[SEARCH-${searchId}] Episode filter results: ${filteredSubtitles.length} of ${processedSubtitles.length} subtitles match ${videoEpisodePattern}`);
                
                // If still no matches, show all but warn
                if (filteredSubtitles.length === 0) {
                    logger.warning(`[SEARCH-${searchId}] No subtitles found for ${videoEpisodePattern}, showing all available`);
                    filteredSubtitles = processedSubtitles;
                }
            }
            
            // Sort subtitles by quality and match
            const sortedSubtitles = this.sortSubtitlesByQuality(filteredSubtitles, videoFilename);
            
            // Limit subtitles per quality tag (max 15 per tag)
            const limitedSubtitles = this.limitSubtitlesPerTag(sortedSubtitles, 15);
            
            logger.success(`[SEARCH-${searchId}] Returning ${limitedSubtitles.length} processed, sorted and limited subtitle URLs`);
            
            // Cache results ONLY if we found subtitles
            if (features.useSeriesCache && limitedSubtitles.length > 0) {
                // For series episodes
                if (episodeInfo) {
                    await seriesCache.set(imdbId, episodeInfo.season, episodeInfo.episode, limitedSubtitles);
                    
                    // Preload next episodes in background
                    if (features.preloadNextEpisodes) {
                        this.preloadNextEpisodes(cleanImdbId, episodeInfo.season, episodeInfo.episode, videoFilename);
                    }
                } 
                // For movies
                else if (!imdbId.includes(':')) {
                    await seriesCache.setMovie(imdbId, limitedSubtitles);
                    logger.info(`[SEARCH-${searchId}] Cached movie subtitles for ${imdbId}`);
                }
            } else if (features.useSeriesCache && limitedSubtitles.length === 0) {
                if (episodeInfo) {
                    logger.warning(`[SEARCH-${searchId}] Not caching empty subtitle results for S${episodeInfo.season}E${episodeInfo.episode}`);
                } else {
                    logger.warning(`[SEARCH-${searchId}] Not caching empty subtitle results for movie ${imdbId}`);
                }
            }
            
            return limitedSubtitles;

        } catch (error) {
            logger.error(`[SEARCH-${searchId}] Search failed`, {
                imdbId: imdbId,
                error: error.message,
                stack: error.stack,
                responseStatus: error.response?.status,
                responseData: error.response?.data?.substring(0, 500)
            });
            return [];
        }
    }

    async processSubtitles(subtitles) {
        const processId = Date.now();
        const processedSubtitles = [];
        
        // Error limiting
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 10; // Stop after 10 consecutive errors
        let totalErrors = 0;
        const MAX_TOTAL_ERRORS = 20; // Stop after 20 total errors
        
        // Determine batch size based on proxy availability
        const batchSize = features.useProxies ? 10 : 2; // Increased for faster processing
        
        logger.info(`[PROCESS-${processId}] Processing ${subtitles.length} subtitles in batches of ${batchSize}`);
        
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
        ];
        
        // Process in batches
        for (let i = 0; i < subtitles.length; i += batchSize) {
            const batch = subtitles.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(subtitles.length / batchSize);
            
            logger.info(`[PROCESS-${processId}] Processing batch ${batchNumber}/${totalBatches}`);
            
            // Add delay between batches (except first)
            if (i > 0) {
                const batchDelay = features.useProxies ? 100 : 1000; // Reduced delay for faster processing
                await new Promise(resolve => setTimeout(resolve, batchDelay));
            }
            
            // Process batch in parallel
            const batchPromises = batch.map(async (subtitle, batchIndex) => {
                const index = i + batchIndex;
                try {
                    logger.debug(`[PROCESS-${processId}] Processing subtitle ${index + 1}/${subtitles.length}: ${subtitle.id}`);
                    
                    // Rotate user agents
                    const userAgent = userAgents[index % userAgents.length];
                    
                    // Get the download page URL from the subtitle data
                    const downloadPageUrl = subtitle.url;
                    
                    // Pass user agent to download function
                    const extractedSrtUrls = await this.getDirectSubtitleUrl(downloadPageUrl, userAgent);
                    
                    if (extractedSrtUrls && extractedSrtUrls.length > 0) {
                        // Return results for this subtitle
                        return extractedSrtUrls.map((url, urlIndex) => ({
                            id: `${subtitle.id}_${urlIndex}`,
                            url: url,
                            lang: subtitle.lang
                        }));
                        consecutiveErrors = 0; // Reset consecutive errors on success
                    } else {
                        logger.warning(`[PROCESS-${processId}] Skipping subtitle ID ${subtitle.id} - no files extracted`);
                        consecutiveErrors++;
                        totalErrors++;
                        return [];
                    }
                } catch (error) {
                    consecutiveErrors++;
                    totalErrors++;
                    
                    // Log error only first few times to avoid spam
                    if (totalErrors <= 5) {
                        logger.error(`[PROCESS-${processId}] Error processing subtitle ID: ${subtitle.id}`, {
                            error: error.message
                        });
                    }
                    return [];
                }
            });
            
            // Wait for batch to complete
            const batchResults = await Promise.all(batchPromises);
            
            // Count actual errors in this batch
            const batchErrors = batchResults.filter(result => result.length === 0).length;
            
            // Check if we should stop due to too many errors
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                logger.error(`[PROCESS-${processId}] Stopping - ${MAX_CONSECUTIVE_ERRORS} consecutive errors reached`);
                logger.error(`[PROCESS-${processId}] Possible causes: proxy issues, network problems, or subs.ro blocking`);
                break;
            }
            
            if (totalErrors >= MAX_TOTAL_ERRORS) {
                logger.error(`[PROCESS-${processId}] Stopping - ${MAX_TOTAL_ERRORS} total errors reached`);
                break;
            }
            
            // Add results to processed list
            batchResults.forEach(results => {
                processedSubtitles.push(...results);
            });
            
            // Log progress
            logger.info(`[PROCESS-${processId}] Batch ${batchNumber} complete. Total processed: ${processedSubtitles.length}, Errors in batch: ${batchErrors}`);
        }

        // Log final status if all failed
        if (processedSubtitles.length === 0 && totalErrors >= MAX_TOTAL_ERRORS) {
            logger.error(`[PROCESS-${processId}] All subtitle downloads failed. Possible SSL/proxy configuration issues.`);
            logger.error(`[PROCESS-${processId}] Make sure your proxies support HTTPS connections.`);
        }
        
        logger.success(`[PROCESS-${processId}] Processed ${processedSubtitles.length} subtitles total`);
        return processedSubtitles;
    }

    async getDirectSubtitleUrl(downloadPageUrl, userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36') {
        const extractId = Date.now();
        
        try {
            logger.info(`[EXTRACT-${extractId}] Downloading archive directly from: ${downloadPageUrl}`);
            
            // subs.ro returns the archive file directly, not an HTML page
            const extractedUrls = await this.downloadAndExtractSubtitle(downloadPageUrl, extractId, userAgent);
            return extractedUrls;
            
        } catch (error) {
            logger.error(`[EXTRACT-${extractId}] Error downloading/extracting subtitle`, {
                error: error.message,
                downloadPageUrl
            });
            return [];
        }
    }

    async downloadAndExtractSubtitle(archiveUrl, extractId, userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36') {
        try {
            logger.info(`[EXTRACT-${extractId}] Downloading archive file: ${archiveUrl}`);
            
            // Use stream download if enabled
            if (this.useStreamDownload) {
                return await this.downloadAndExtractStream(archiveUrl, extractId, userAgent);
            }
            
            // Fallback to traditional download
            return await this.downloadAndExtractTraditional(archiveUrl, extractId, userAgent);
        } catch (error) {
            logger.error(`[EXTRACT-${extractId}] Download/extract failed:`, error.message);
            throw error;
        }
    }
    
    async downloadAndExtractStream(archiveUrl, extractId, userAgent) {
        const headers = {
            'User-Agent': userAgent,
            'Referer': this.baseUrl,
            'Accept': '*/*',
            'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br'
        };
        
        let proxy = null;
        if (features.useProxies) {
            const proxyData = await proxyRotator.getNextProxy();
            proxy = proxyData.auth 
                ? `http://${proxyData.auth.username}:${proxyData.auth.password}@${proxyData.host}:${proxyData.port}`
                : `http://${proxyData.host}:${proxyData.port}`;
        }
        
        logger.info(`[EXTRACT-${extractId}] Starting stream download from ${archiveUrl}`);
        
        try {
            const extractedPaths = await this.streamExtractor.downloadAndExtractStream(
                archiveUrl, 
                extractId, 
                { headers, proxy }
            );
            
            // Convert paths to URLs
            const urls = extractedPaths.map(srtPath => {
                const fileName = path.basename(srtPath);
                return `${this.publicUrl}/subtitle/${fileName}`;
            });
            
            logger.success(`[EXTRACT-${extractId}] Stream extraction complete: ${urls.length} files`);
            
            return urls;
        } catch (error) {
            logger.error(`[EXTRACT-${extractId}] Stream extraction failed:`, error.message);
            throw error;
        }
    }
    
    async downloadAndExtractTraditional(archiveUrl, extractId, userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36') {
        try {
            logger.info(`[EXTRACT-${extractId}] Using traditional download method`);
            
            // Retry logic with exponential backoff for rate limiting
            let response;
            let retries = 3;
            let retryDelay = 2000; // Start with 2 seconds
            let lastUsedProxy = null; // Track proxy for error handling
            
            while (retries > 0) {
                try {
                    const config = {
                        responseType: 'arraybuffer',
                        headers: {
                            'User-Agent': userAgent,
                            'Referer': this.baseUrl,
                            'Accept': '*/*',
                            'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
                            'Accept-Encoding': 'gzip, deflate, br'
                        },
                        timeout: 60000  // 60 second timeout for downloads
                    };
                    
                    // Get proxy if enabled
                    if (features.useProxies) {
                        const proxyData = await proxyRotator.getNextProxy();
                        
                        // For HTTPS URLs, we need to use httpsAgent with proxy
                        if (archiveUrl.startsWith('https://')) {
                            const { HttpsProxyAgent } = require('https-proxy-agent');
                            const proxyUrl = proxyData.auth 
                                ? `http://${proxyData.auth.username}:${proxyData.auth.password}@${proxyData.host}:${proxyData.port}`
                                : `http://${proxyData.host}:${proxyData.port}`;
                            config.httpsAgent = new HttpsProxyAgent(proxyUrl);
                            lastUsedProxy = proxyUrl;
                            logger.debug(`[EXTRACT-${extractId}] Using HTTPS proxy agent: ${proxyData.host}:${proxyData.port}`);
                        } else {
                            // For HTTP URLs, use normal proxy config
                            config.proxy = {
                                host: proxyData.host,
                                port: proxyData.port,
                                auth: proxyData.auth
                            };
                            lastUsedProxy = `http://${config.proxy.host}:${config.proxy.port}`;
                            logger.debug(`[EXTRACT-${extractId}] Using HTTP proxy: ${proxyData.host}:${proxyData.port}`);
                        }
                    }
                    
                    response = await axios.get(archiveUrl, config);
                    
                    // Mark proxy as successful if used
                    if (features.useProxies && lastUsedProxy) {
                        proxyRotator.markProxySuccess(lastUsedProxy);
                    }
                    
                    break; // Success, exit retry loop
                } catch (error) {
                    // Mark proxy as failed if it was a proxy error
                    if (features.useProxies && lastUsedProxy && error.code === 'ECONNREFUSED') {
                        proxyRotator.markProxyFailed(lastUsedProxy);
                    }
                    
                    if (error.response?.status === 429 && retries > 1) {
                        logger.warning(`[EXTRACT-${extractId}] Rate limited (429), retrying in ${retryDelay}ms... (${retries - 1} retries left)`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        retryDelay *= 2; // Exponential backoff
                        retries--;
                    } else {
                        throw error; // Re-throw if not rate limited or no retries left
                    }
                }
            }

            logger.debug(`[EXTRACT-${extractId}] Archive downloaded, size: ${response.data.length} bytes`);
            
            // Detect file type by magic bytes
            const buffer = Buffer.from(response.data);
            const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B; // PK signature
            const isRar = buffer.toString('ascii', 0, 4) === 'Rar!';
            
            let fileName, filePath;
            if (isZip) {
                fileName = `subtitle_${extractId}.zip`;
                filePath = path.join(this.tempDir, fileName);
                logger.info(`[EXTRACT-${extractId}] Detected ZIP archive`);
            } else if (isRar) {
                fileName = `subtitle_${extractId}.rar`;
                filePath = path.join(this.tempDir, fileName);
                logger.info(`[EXTRACT-${extractId}] Detected RAR archive`);
            } else {
                logger.warning(`[EXTRACT-${extractId}] Unknown archive format`);
                return null;
            }

            await fs.writeFile(filePath, response.data);

            logger.info(`[EXTRACT-${extractId}] Extracting archive file`);
            const extractedPaths = await this.extractArchiveFile(filePath, extractId, isZip);
            
            // Clean up archive file
            await fs.unlink(filePath).catch(() => {});

            if (extractedPaths && extractedPaths.length > 0) {
                logger.success(`[EXTRACT-${extractId}] Successfully extracted: ${extractedPaths.length} files`);
                // Return all extracted file paths as URLs
                return extractedPaths.map(srtPath => {
                    const fileName = path.basename(srtPath);
                    return `${this.publicUrl}/subtitle/${fileName}`;
                });
            }

            logger.warning(`[EXTRACT-${extractId}] No SRT file found in archive`);
            return [];
            
        } catch (error) {
            logger.error(`[EXTRACT-${extractId}] Error downloading/extracting subtitle`, {
                error: error.message,
                archiveUrl
            });
            return null;
        }
    }

    async extractArchiveFile(archivePath, extractId, isZip) {
        try {
            if (isZip) {
                logger.debug(`[EXTRACT-${extractId}] Starting ZIP extraction: ${archivePath}`);
                return await this.extractZipFile(archivePath, extractId);
            } else {
                logger.debug(`[EXTRACT-${extractId}] Starting RAR extraction: ${archivePath}`);
                const extractedPaths = await this.rarExtractor.extractSubtitle(archivePath, this.tempDir);
                
                if (extractedPaths && extractedPaths.length > 0) {
                    logger.debug(`[EXTRACT-${extractId}] RAR extraction successful: ${extractedPaths.length} files extracted`);
                }
                
                return extractedPaths;
            }
        } catch (error) {
            logger.error(`[EXTRACT-${extractId}] Error in archive extraction`, {
                error: error.message,
                archivePath
            });
            return [];
        }
    }

    async extractZipFile(zipPath, extractId) {
        try {
            const yauzl = require('yauzl');
            
            return new Promise((resolve, reject) => {
                yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
                    if (err) {
                        logger.error(`[EXTRACT-${extractId}] Error opening ZIP: ${err.message}`);
                        return reject(err);
                    }

                    const extractedFiles = [];
                    let pendingExtractions = 0;
                    let entriesProcessed = 0;

                    zipfile.readEntry();
                    zipfile.on('entry', (entry) => {
                        // Look for .srt files
                        if (/\.srt$/i.test(entry.fileName)) {
                            logger.debug(`[EXTRACT-${extractId}] Found SRT file: ${entry.fileName}`);
                            pendingExtractions++;
                            
                            zipfile.openReadStream(entry, (err, readStream) => {
                                if (err) return reject(err);

                                const outputPath = path.join(this.tempDir, `extracted_${extractId}_${extractedFiles.length}_${path.basename(entry.fileName)}`);
                                const writeStream = require('fs').createWriteStream(outputPath);
                                
                                readStream.pipe(writeStream);
                                writeStream.on('finish', () => {
                                    logger.success(`[EXTRACT-${extractId}] Extracted SRT: ${path.basename(outputPath)}`);
                                    extractedFiles.push(outputPath);
                                    pendingExtractions--;
                                    
                                    if (pendingExtractions === 0 && entriesProcessed === zipfile.entryCount) {
                                        zipfile.close();
                                        resolve(extractedFiles.length > 0 ? extractedFiles : []);
                                    }
                                });
                                writeStream.on('error', reject);
                            });
                        }
                        
                        entriesProcessed++;
                        zipfile.readEntry();
                    });

                    zipfile.on('end', () => {
                        if (pendingExtractions === 0) {
                            if (extractedFiles.length > 0) {
                                logger.success(`[EXTRACT-${extractId}] ZIP extraction completed: ${extractedFiles.length} files extracted`);
                                resolve(extractedFiles); // Return ALL extracted files
                            } else {
                                logger.warning(`[EXTRACT-${extractId}] No SRT files found in ZIP`);
                                resolve([]);
                            }
                        }
                    });

                    zipfile.on('error', reject);
                });
            });
        } catch (error) {
            logger.error(`[EXTRACT-${extractId}] ZIP extraction failed`, {
                error: error.message,
                zipPath
            });
            return null;
        }
    }
}

module.exports = SubsRoService;