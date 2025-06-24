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
            const fiveHoursAgo = now - (5 * 60 * 60 * 1000); // 5 hours in milliseconds
            
            let deletedCount = 0;
            
            for (const file of files) {
                if (file.endsWith('.log')) {
                    const filePath = path.join(this.logDir, file);
                    const stats = fs.statSync(filePath);
                    
                    // Check if file is older than 5 hours
                    if (stats.mtime.getTime() < fiveHoursAgo) {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    }
                }
            }
            
            if (deletedCount > 0) {
                this.info(`[LOG CLEANUP] Deleted ${deletedCount} log files older than 5 hours`);
            }
        } catch (error) {
            // Don't log errors to avoid infinite loop
            console.error('[LOG CLEANUP] Error during cleanup:', error.message);
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