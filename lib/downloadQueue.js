const EventEmitter = require('events');
const logger = require('./logger');

class DownloadQueue extends EventEmitter {
    constructor(options = {}) {
        super();
        this.concurrency = options.concurrency || 2; // Max parallel downloads
        this.retryDelay = options.retryDelay || 1000; // Base retry delay
        this.requestDelay = options.requestDelay || 500; // Delay between requests
        
        this.queue = [];
        this.active = 0;
        this.completed = 0;
        this.failed = 0;
        
        // Rate limiting tracking
        this.lastRequestTime = 0;
        this.requestTimes = []; // Track last N request times
        this.maxRequestsPerMinute = 30; // Adjust based on site limits
        
        // Domain-specific delays
        this.domainDelays = new Map();
        this.domainLastRequest = new Map();
    }
    
    async add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({
                task,
                resolve,
                reject,
                retries: 3,
                priority: task.priority || 0
            });
            
            // Sort by priority
            this.queue.sort((a, b) => b.priority - a.priority);
            
            this.processNext();
        });
    }
    
    async processNext() {
        if (this.active >= this.concurrency || this.queue.length === 0) {
            return;
        }
        
        const item = this.queue.shift();
        this.active++;
        
        try {
            // Adaptive rate limiting
            await this.waitForRateLimit();
            
            const result = await this.executeTask(item);
            item.resolve(result);
            this.completed++;
            
            // Successful request - decrease domain delay
            this.adjustDomainDelay(item.task.domain, true);
            
        } catch (error) {
            if (error.response?.status === 429 && item.retries > 0) {
                // Rate limited - increase delay and retry
                item.retries--;
                this.adjustDomainDelay(item.task.domain, false);
                
                const backoffDelay = this.calculateBackoff(4 - item.retries);
                logger.warning(`[QUEUE] Rate limited, retrying in ${backoffDelay}ms (${item.retries} left)`);
                
                setTimeout(() => {
                    this.queue.unshift(item); // Add back to front of queue
                    this.processNext();
                }, backoffDelay);
            } else {
                item.reject(error);
                this.failed++;
            }
        }
        
        this.active--;
        
        // Process next item with slight delay
        setTimeout(() => this.processNext(), this.requestDelay);
    }
    
    async executeTask(item) {
        const startTime = Date.now();
        
        try {
            const result = await item.task.execute();
            
            // Track successful request time
            const duration = Date.now() - startTime;
            logger.debug(`[QUEUE] Task completed in ${duration}ms`);
            
            return result;
        } catch (error) {
            // Track failed request
            const duration = Date.now() - startTime;
            logger.error(`[QUEUE] Task failed after ${duration}ms: ${error.message}`);
            throw error;
        }
    }
    
    async waitForRateLimit() {
        const now = Date.now();
        
        // Clean old request times (older than 1 minute)
        this.requestTimes = this.requestTimes.filter(time => now - time < 60000);
        
        // Check if we're hitting rate limit
        if (this.requestTimes.length >= this.maxRequestsPerMinute) {
            const oldestRequest = this.requestTimes[0];
            const waitTime = 60000 - (now - oldestRequest) + 1000; // +1s buffer
            
            if (waitTime > 0) {
                logger.info(`[QUEUE] Rate limit reached, waiting ${Math.round(waitTime/1000)}s`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        
        // Ensure minimum delay between requests
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.requestDelay) {
            await new Promise(resolve => 
                setTimeout(resolve, this.requestDelay - timeSinceLastRequest)
            );
        }
        
        this.lastRequestTime = Date.now();
        this.requestTimes.push(this.lastRequestTime);
    }
    
    calculateBackoff(attempt) {
        // Exponential backoff with jitter
        const baseDelay = this.retryDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 1000; // 0-1s random jitter
        return Math.min(baseDelay + jitter, 30000); // Max 30s
    }
    
    adjustDomainDelay(domain = 'default', success) {
        const currentDelay = this.domainDelays.get(domain) || this.requestDelay;
        
        if (success) {
            // Decrease delay on success (but not below minimum)
            const newDelay = Math.max(this.requestDelay, currentDelay * 0.9);
            this.domainDelays.set(domain, newDelay);
        } else {
            // Increase delay on failure (rate limiting)
            const newDelay = Math.min(10000, currentDelay * 1.5);
            this.domainDelays.set(domain, newDelay);
            logger.info(`[QUEUE] Increased delay for ${domain} to ${newDelay}ms`);
        }
    }
    
    getStats() {
        return {
            queued: this.queue.length,
            active: this.active,
            completed: this.completed,
            failed: this.failed,
            requestsPerMinute: this.requestTimes.length
        };
    }
}

module.exports = DownloadQueue;