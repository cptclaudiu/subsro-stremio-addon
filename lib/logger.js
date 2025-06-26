const fs = require('fs');
const path = require('path');
const util = require('util');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '../logs');
        this.logFile = path.join(this.logDir, `addon-${new Date().toISOString().split('T')[0]}.log`);
        
        // Create logs directory if it doesn't exist
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
        
        // Write startup message
        this.info('=== ADDON STARTED ===');
        this.info(`Log file: ${this.logFile}`);
        
        // Start automatic log cleanup
        this.startLogCleanup();
    }
    
    startLogCleanup() {
        // Run cleanup every hour
        setInterval(() => {
            this.cleanupOldLogs();
        }, 60 * 60 * 1000); // 1 hour
        
        // Also run cleanup on startup
        this.cleanupOldLogs();
    }
    
    async cleanupOldLogs() {
        try {
            const files = fs.readdirSync(this.logDir);
            const now = Date.now();
            const maxAge = parseInt(process.env.LOG_RETENTION_HOURS || '48') * 60 * 60 * 1000; // Default 48 hours
            const cutoffTime = now - maxAge;
            
            let deletedCount = 0;
            let totalSize = 0;
            
            for (const file of files) {
                if (file.endsWith('.log') || file.endsWith('.log.gz')) {
                    const filePath = path.join(this.logDir, file);
                    const stats = fs.statSync(filePath);
                    totalSize += stats.size;
                    
                    // Check if file is older than retention period
                    if (stats.mtime.getTime() < cutoffTime) {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    }
                }
            }
            
            // Also check total size and remove oldest if > 500MB
            const maxDirSize = parseInt(process.env.LOG_MAX_SIZE_MB || '500') * 1024 * 1024;
            if (totalSize > maxDirSize) {
                this.enforceMaxSize(maxDirSize);
            }
            
            if (deletedCount > 0) {
                this.info(`[LOG CLEANUP] Deleted ${deletedCount} log files older than ${process.env.LOG_RETENTION_HOURS || '48'} hours`);
            }
        } catch (error) {
            // Don't log errors to avoid infinite loop
            console.error('[LOG CLEANUP] Error during cleanup:', error.message);
        }
    }
    
    enforceMaxSize(maxSize) {
        try {
            const files = fs.readdirSync(this.logDir)
                .filter(f => f.endsWith('.log') || f.endsWith('.log.gz'))
                .map(f => {
                    const filePath = path.join(this.logDir, f);
                    const stats = fs.statSync(filePath);
                    return { name: f, path: filePath, mtime: stats.mtime, size: stats.size };
                })
                .sort((a, b) => a.mtime - b.mtime); // Oldest first
            
            let currentSize = files.reduce((sum, f) => sum + f.size, 0);
            let deletedCount = 0;
            
            while (currentSize > maxSize && files.length > 1) { // Keep at least 1 file
                const oldest = files.shift();
                fs.unlinkSync(oldest.path);
                currentSize -= oldest.size;
                deletedCount++;
            }
            
            if (deletedCount > 0) {
                this.info(`[LOG CLEANUP] Deleted ${deletedCount} files to enforce max size limit`);
            }
        } catch (error) {
            console.error('[LOG CLEANUP] Error enforcing max size:', error.message);
        }
    }
    
    formatMessage(level, message, details = null) {
        const timestamp = new Date().toISOString();
        const pid = process.pid;
        let logEntry = `[${timestamp}] [PID:${pid}] [${level}] ${message}`;
        
        if (details) {
            logEntry += '\n' + util.inspect(details, { depth: 3, colors: false });
        }
        
        return logEntry;
    }
    
    writeLog(level, message, details) {
        const formattedMessage = this.formatMessage(level, message, details);
        
        // Console output with colors
        const colors = {
            INFO: '\x1b[36m',    // Cyan
            SUCCESS: '\x1b[32m', // Green
            WARNING: '\x1b[33m', // Yellow
            ERROR: '\x1b[31m',   // Red
            DEBUG: '\x1b[35m'    // Magenta
        };
        
        console.log(`${colors[level] || ''}${formattedMessage}\x1b[0m`);
        
        // File output
        fs.appendFileSync(this.logFile, formattedMessage + '\n');
    }
    
    info(message, details) {
        this.writeLog('INFO', message, details);
    }
    
    success(message, details) {
        this.writeLog('SUCCESS', message, details);
    }
    
    warning(message, details) {
        this.writeLog('WARNING', message, details);
    }
    
    error(message, details) {
        this.writeLog('ERROR', message, details);
    }
    
    debug(message, details) {
        this.writeLog('DEBUG', message, details);
    }
    
    request(req) {
        this.info(`HTTP Request: ${req.method} ${req.url}`, {
            headers: req.headers,
            params: req.params,
            query: req.query
        });
    }
    
    response(statusCode, data) {
        const level = statusCode >= 200 && statusCode < 300 ? 'SUCCESS' : 'ERROR';
        this.writeLog(level, `HTTP Response: ${statusCode}`, 
            typeof data === 'object' ? data : { body: data });
    }
}

module.exports = new Logger();