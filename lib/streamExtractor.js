const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Transform, PassThrough } = require('stream');
const axios = require('axios');
const logger = require('./logger');
const EventEmitter = require('events');

class StreamExtractor extends EventEmitter {
    constructor() {
        super();
        this.tempDir = path.join(__dirname, '../temp');
    }

    /**
     * Download și extrage arhiva folosind streams
     * Emite evenimente: 'progress', 'extracted', 'error', 'complete'
     */
    async downloadAndExtractStream(archiveUrl, extractId, options = {}) {
        const startTime = Date.now();
        let totalSize = 0;
        let downloadedSize = 0;
        let extractedFiles = [];
        
        try {
            logger.info(`[STREAM-${extractId}] Starting streaming download from ${archiveUrl}`);
            
            // Configurare request cu streaming
            const response = await axios({
                method: 'GET',
                url: archiveUrl,
                responseType: 'stream',
                timeout: 30000,
                headers: options.headers || {},
                ...(options.proxy ? { 
                    httpsAgent: new (require('https-proxy-agent').HttpsProxyAgent)(options.proxy) 
                } : {})
            });

            totalSize = parseInt(response.headers['content-length'] || '0', 10);
            logger.info(`[STREAM-${extractId}] Total size: ${this.formatBytes(totalSize)}`);
            
            // Stream pentru progress tracking
            const progressStream = new Transform({
                transform: (chunk, encoding, callback) => {
                    downloadedSize += chunk.length;
                    const progress = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
                    
                    // Log progress instead of emitting events
                    const progressData = {
                        downloadedSize,
                        totalSize,
                        progress: Math.round(progress),
                        speed: this.calculateSpeed(startTime, downloadedSize)
                    };
                    
                    // Log every 10% progress
                    if (Math.floor(progress / 10) > Math.floor((progress - (chunk.length / totalSize * 100)) / 10)) {
                        logger.info(`[STREAM-${extractId}] Download progress: ${progressData.progress}% (${progressData.speed})`);
                    }
                    
                    callback(null, chunk);
                }
            });

            // Buffer pentru detectare tip arhivă
            let headerBuffer = Buffer.alloc(0);
            let archiveType = null;
            let tempFilePath = null;
            
            const detectStream = new Transform({
                transform: async (chunk, encoding, callback) => {
                    try {
                        // Acumulează primii bytes pentru detectare
                        if (headerBuffer.length < 4) {
                            headerBuffer = Buffer.concat([headerBuffer, chunk]);
                            
                            if (headerBuffer.length >= 4) {
                                // Detectează tipul arhivei
                                if (headerBuffer[0] === 0x50 && headerBuffer[1] === 0x4B) {
                                    archiveType = 'zip';
                                    tempFilePath = path.join(this.tempDir, `stream_${extractId}.zip`);
                                } else if (headerBuffer.toString('ascii', 0, 4) === 'Rar!') {
                                    archiveType = 'rar';
                                    tempFilePath = path.join(this.tempDir, `stream_${extractId}.rar`);
                                }
                                
                                if (archiveType) {
                                    logger.info(`[STREAM-${extractId}] Detected ${archiveType.toUpperCase()} archive`);
                                    
                                    // Începe extracția în paralel pentru ZIP-uri
                                    if (archiveType === 'zip') {
                                        logger.info(`[STREAM-${extractId}] Starting parallel ZIP extraction`);
                                        this.startParallelZipExtraction(tempFilePath, extractId);
                                    }
                                }
                            }
                        }
                        
                        callback(null, chunk);
                    } catch (err) {
                        callback(err);
                    }
                }
            });

            // Stream de scriere pe disk
            const writeStream = fs.createWriteStream(tempFilePath || path.join(this.tempDir, `stream_${extractId}.tmp`));
            
            // Pipeline streaming
            await pipeline(
                response.data,
                progressStream,
                detectStream,
                writeStream
            );

            logger.success(`[STREAM-${extractId}] Download complete in ${Date.now() - startTime}ms`);
            
            // Pentru RAR, extrage după download complet
            if (archiveType === 'rar') {
                extractedFiles = await this.extractRarFile(tempFilePath, extractId);
            } else if (archiveType === 'zip') {
                // Pentru ZIP, așteptăm să se termine extracția paralelă
                extractedFiles = await this.waitForZipExtraction(extractId);
            }
            
            // Cleanup
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                await fs.promises.unlink(tempFilePath).catch(() => {});
            }
            
            const duration = Date.now() - startTime;
            logger.success(`[STREAM-${extractId}] Extraction complete:`, {
                files: extractedFiles.length,
                duration: `${duration}ms`,
                totalSize: this.formatBytes(downloadedSize),
                avgSpeed: this.calculateSpeed(startTime, downloadedSize)
            });
            
            return extractedFiles;
            
        } catch (error) {
            logger.error(`[STREAM-${extractId}] Stream extraction failed:`, error.message);
            throw error;
        }
    }

    /**
     * Extracție paralelă pentru ZIP în timp ce se descarcă
     */
    async startParallelZipExtraction(zipPath, extractId) {
        const yauzl = require('yauzl');
        const extractedFiles = [];
        
        // Așteaptă puțin să se scrie header-ul complet
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const checkAndExtract = async () => {
            try {
                // Încearcă să deschidă ZIP-ul în mod lazy
                yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
                    if (err) {
                        // Fișierul nu e încă complet, reîncearcă
                        setTimeout(checkAndExtract, 500);
                        return;
                    }
                    
                    zipfile.readEntry();
                    
                    zipfile.on('entry', async (entry) => {
                        if (/\/$/.test(entry.fileName)) {
                            // Directory entry
                            zipfile.readEntry();
                        } else if (entry.fileName.match(/\.(srt|sub|ass|ssa|vtt)$/i)) {
                            // Subtitle file found
                            const outputPath = path.join(this.tempDir, `extracted_${Date.now()}_${path.basename(entry.fileName)}`);
                            
                            zipfile.openReadStream(entry, (err, readStream) => {
                                if (err) {
                                    logger.error(`[STREAM-${extractId}] Error reading entry:`, err);
                                    zipfile.readEntry();
                                    return;
                                }
                                
                                const writeStream = fs.createWriteStream(outputPath);
                                
                                readStream.on('end', () => {
                                    logger.info(`[STREAM-${extractId}] Extracted: ${path.basename(outputPath)}`);
                                    extractedFiles.push(outputPath);
                                    zipfile.readEntry();
                                });
                                
                                readStream.pipe(writeStream);
                            });
                        } else {
                            zipfile.readEntry();
                        }
                    });
                    
                    zipfile.on('end', () => {
                        this.zipExtractionComplete = { extractId, files: extractedFiles };
                        zipfile.close();
                    });
                });
            } catch (error) {
                // Retry if file is still being written
                setTimeout(checkAndExtract, 500);
            }
        };
        
        // Start checking after initial delay
        setTimeout(checkAndExtract, 200);
    }

    /**
     * Așteaptă finalizarea extracției ZIP paralele
     */
    async waitForZipExtraction(extractId, timeout = 30000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            if (this.zipExtractionComplete && this.zipExtractionComplete.extractId === extractId) {
                const files = this.zipExtractionComplete.files;
                delete this.zipExtractionComplete;
                return files;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        throw new Error('ZIP extraction timeout');
    }

    /**
     * Extrage fișier RAR (după download complet)
     */
    async extractRarFile(rarPath, extractId) {
        const RarExtractor = require('./rarExtractor');
        const rarExtractor = new RarExtractor();
        
        try {
            const extractedFiles = await rarExtractor.extract(rarPath, this.tempDir);
            
            extractedFiles.forEach(file => {
                logger.info(`[STREAM-${extractId}] Extracted: ${path.basename(file)}`);
            });
            
            return extractedFiles;
        } catch (error) {
            logger.error(`[STREAM-${extractId}] RAR extraction failed:`, error.message);
            throw error;
        }
    }

    /**
     * Calculează viteza de download
     */
    calculateSpeed(startTime, downloadedSize) {
        const duration = (Date.now() - startTime) / 1000; // seconds
        const bytesPerSecond = downloadedSize / duration;
        return this.formatBytes(bytesPerSecond) + '/s';
    }

    /**
     * Formatare bytes pentru afișare
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = StreamExtractor;