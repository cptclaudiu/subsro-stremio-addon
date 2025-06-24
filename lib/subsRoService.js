const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const RarExtractor = require('./rarExtractor');
const logger = require('./logger');

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
        this.ensureTempDir();
        this.startCleanupInterval(); // Start automatic cleanup
        logger.info('SubsRoService initialized', {
            baseUrl: this.baseUrl,
            tempDir: this.tempDir
        });
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
        // Run cleanup every hour
        setInterval(() => {
            this.cleanupOldFiles();
        }, 60 * 60 * 1000); // 1 hour
        
        // Also run cleanup on startup
        this.cleanupOldFiles();
    }

    async cleanupOldFiles() {
        try {
            const files = await fs.readdir(this.tempDir);
            const now = Date.now();
            const fiveHoursAgo = now - (5 * 60 * 60 * 1000); // 5 hours in milliseconds
            
            let deletedCount = 0;
            
            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                try {
                    const stats = await fs.stat(filePath);
                    
                    // Check if file is older than 5 hours
                    if (stats.mtime.getTime() < fiveHoursAgo) {
                        await fs.unlink(filePath);
                        deletedCount++;
                    }
                } catch (err) {
                    // Skip files that can't be accessed
                    continue;
                }
            }
            
            if (deletedCount > 0) {
                logger.info(`[CLEANUP] Deleted ${deletedCount} subtitle files older than 5 hours`);
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
        
        // Log the distribution
        logger.info('[LIMIT] Subtitle distribution by tag:', tagCounts);
        if (removedCamCount.HDCAM > 0 || removedCamCount.CAM > 0) {
            logger.info('[LIMIT] Removed CAM subtitles:', removedCamCount);
        }
        
        return limitedSubtitles;
    }

    generateAntispam() {
        return crypto.randomBytes(20).toString('hex');
    }

    async searchSubtitles(imdbId, videoFilename = null) {
        const searchId = Date.now();
        logger.info(`[SEARCH-${searchId}] Starting subtitle search`, { imdbId });
        
        try {
            // First, let's try searching by IMDB ID directly on the listing page
            const listUrl = `${this.baseUrl}/subtitrari/imdbid/${imdbId.replace('tt', '')}`;
            logger.debug(`[SEARCH-${searchId}] Fetching URL: ${listUrl}`);
            
            const response = await axios.get(listUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
                const title = titleElem.text().trim() || titleElem.attr('title') || 'Interstellar';
                const downloadLink = $elem.find('a[href*="/subtitrare/descarca/"]').attr('href');
                const translatorText = $elem.find('p:contains("Traducător")').text();
                const translator = translatorText.split(':')[1]?.trim() || '';
                const downloads = $elem.find('p:contains("Descărcări")').text().replace('Descărcări:', '').replace(',', '').trim();
                const comment = $elem.find('.bg-\\[\\#f4f3e9\\] p').text().trim();
                const language = $elem.find('img[alt*="Subtitrare"]').attr('alt');
                const isRomanian = !language || language.includes('- ro');
                
                if (downloadLink && isRomanian) {
                    const subtitleId = `subsro_${index}_${imdbId}`;
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
                imdbId,
                totalFound: subtitles.length
            });
            
            // Process all found subtitles to download and extract
            const processedSubtitles = await this.processSubtitles(subtitles);
            
            // Sort subtitles by quality and match
            const sortedSubtitles = this.sortSubtitlesByQuality(processedSubtitles, videoFilename);
            
            // Limit subtitles per quality tag (max 15 per tag)
            const limitedSubtitles = this.limitSubtitlesPerTag(sortedSubtitles, 15);
            
            logger.success(`[SEARCH-${searchId}] Returning ${limitedSubtitles.length} processed, sorted and limited subtitle URLs (from ${sortedSubtitles.length} total)`);
            return limitedSubtitles;

        } catch (error) {
            logger.error(`[SEARCH-${searchId}] Search failed`, {
                imdbId,
                error: error.message,
                stack: error.stack,
                responseStatus: error.response?.status,
                responseData: error.response?.data?.substring(0, 500)
            });
            return [];
        }
    }

    async processSubtitles(subtitles) {
        const processedSubtitles = [];
        const processId = Date.now();
        
        logger.info(`[PROCESS-${processId}] Processing ${subtitles.length} subtitles to download and extract`);
        
        for (const [index, subtitle] of subtitles.entries()) {
            try {
                logger.debug(`[PROCESS-${processId}] Processing subtitle ${index + 1}/${subtitles.length}: ${subtitle.id}`);
                
                // Add rate limiting delay to avoid 429 errors
                if (index > 0) {
                    const delay = Math.min(1000 + (index * 200), 3000); // Progressive delay up to 3 seconds
                    logger.debug(`[PROCESS-${processId}] Rate limiting: waiting ${delay}ms before next download`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
                // Get the download page URL from the subtitle data
                const downloadPageUrl = subtitle.url;
                
                // Extract ALL SRT files from archive
                const extractedSrtUrls = await this.getDirectSubtitleUrl(downloadPageUrl);
                
                if (extractedSrtUrls && extractedSrtUrls.length > 0) {
                    // Add each extracted subtitle as a separate entry
                    extractedSrtUrls.forEach((url, urlIndex) => {
                        processedSubtitles.push({
                            id: `${subtitle.id}_${urlIndex}`,
                            url: url,
                            lang: subtitle.lang
                        });
                    });
                    logger.success(`[PROCESS-${processId}] Successfully processed ${extractedSrtUrls.length} subtitles from archive ID: ${subtitle.id}`);
                } else {
                    // Fallback to demo subtitle if extraction fails
                    const cleanName = `fallback_${subtitle.id}`;
                    processedSubtitles.push({
                        id: subtitle.id,
                        url: `http://localhost:7000/subtitle/${encodeURIComponent(cleanName)}.srt`,
                        lang: subtitle.lang
                    });
                    logger.warning(`[PROCESS-${processId}] Fallback to demo for subtitle ID: ${subtitle.id}`);
                }
            } catch (error) {
                logger.error(`[PROCESS-${processId}] Error processing subtitle ID: ${subtitle.id}`, {
                    error: error.message
                });
                
                // Fallback to demo subtitle on error
                const cleanName = `error_fallback_${subtitle.id}`;
                processedSubtitles.push({
                    id: subtitle.id,
                    url: `http://localhost:7000/subtitle/${encodeURIComponent(cleanName)}.srt`,
                    lang: subtitle.lang
                });
            }
        }

        logger.success(`[PROCESS-${processId}] Processed ${processedSubtitles.length} subtitles total`);
        return processedSubtitles;
    }

    async getDirectSubtitleUrl(downloadPageUrl) {
        const extractId = Date.now();
        
        try {
            logger.info(`[EXTRACT-${extractId}] Downloading archive directly from: ${downloadPageUrl}`);
            
            // subs.ro returns the archive file directly, not an HTML page
            const extractedUrls = await this.downloadAndExtractSubtitle(downloadPageUrl, extractId);
            return extractedUrls;
            
        } catch (error) {
            logger.error(`[EXTRACT-${extractId}] Error downloading/extracting subtitle`, {
                error: error.message,
                downloadPageUrl
            });
            return [];
        }
    }

    async downloadAndExtractSubtitle(archiveUrl, extractId) {
        try {
            logger.info(`[EXTRACT-${extractId}] Downloading archive file: ${archiveUrl}`);
            
            const response = await axios.get(archiveUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': this.baseUrl
                },
                timeout: 60000  // 60 second timeout for downloads
            });

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
                    return `http://localhost:7000/subtitle/${fileName}`;
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