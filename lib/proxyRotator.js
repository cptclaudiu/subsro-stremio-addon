const axios = require('axios');
const logger = require('./logger');

class ProxyRotator {
    constructor() {
        // Webshare stable proxies (your 10 premium proxies)
        this.stableProxies = [
            'http://ycegwrfv:g43ge2pswkzc@198.23.239.134:6540',
            'http://ycegwrfv:g43ge2pswkzc@207.244.217.165:6712',
            'http://ycegwrfv:g43ge2pswkzc@107.172.163.27:6543',
            'http://ycegwrfv:g43ge2pswkzc@23.94.138.75:6349',
            'http://ycegwrfv:g43ge2pswkzc@216.10.27.159:6837',
            'http://ycegwrfv:g43ge2pswkzc@136.0.207.84:6661',
            'http://ycegwrfv:g43ge2pswkzc@64.64.118.149:6732',
            'http://ycegwrfv:g43ge2pswkzc@142.147.128.93:6593',
            'http://ycegwrfv:g43ge2pswkzc@104.239.105.125:6655',
            'http://ycegwrfv:g43ge2pswkzc@173.0.9.70:5653'
        ];
        
        this.dynamicProxies = [];
        this.lastRefresh = 0;
        this.refreshInterval = 60 * 60 * 1000; // 60 minutes (1 hour)
        this.currentStableIndex = 0;
        this.currentDynamicIndex = 0;
        
        // Track proxy performance
        this.proxyStats = new Map();
        this.failedProxies = new Set();
        
        // Skip dynamic proxy refresh - use only Webshare premium proxies
        logger.info('[PROXY-ROTATOR] Using only Webshare premium proxies (no dynamic proxies)');
    }
    
    async refreshDynamicProxies() {
        try {
            // Use GeoNode free proxy API - most reliable free option
            const geoNodeUrl = 'https://proxylist.geonode.com/api/proxy-list?limit=50&page=1&sort_by=lastChecked&sort_type=desc&speed=fast';
            
            logger.info('[PROXY-ROTATOR] Fetching fresh proxy list from GeoNode...');
            logger.debug('[PROXY-ROTATOR] Request details:', {
                url: geoNodeUrl,
                method: 'GET',
                timeout: 10000
            });
            
            const response = await axios.get(geoNodeUrl, { 
                timeout: 10000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            logger.debug('[PROXY-ROTATOR] Response details:', {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                dataLength: response.data ? response.data.length : 0,
                dataType: typeof response.data,
                dataSample: response.data ? String(response.data).substring(0, 200) : 'No data'
            });
            
            if (response.status === 432) {
                logger.warning('[PROXY-ROTATOR] ProxyScrape returned status 432:', {
                    possibleReasons: [
                        'Rate limiting - too many requests',
                        'API key required but not provided', 
                        'Geographic restrictions',
                        'API endpoint changed'
                    ],
                    responseData: response.data
                });
            }
            
            if (response.data && response.status === 200) {
                // GeoNode returns JSON format
                let proxyList = [];
                
                if (response.data.data && Array.isArray(response.data.data)) {
                    // Parse GeoNode JSON response
                    proxyList = response.data.data
                        .filter(proxy => proxy.ip && proxy.port && proxy.protocols)
                        .slice(0, 50) // Take top 50
                        .map(proxy => {
                            const protocol = proxy.protocols.includes('https') ? 'https' : 'http';
                            return `${protocol}://${proxy.ip}:${proxy.port}`;
                        });
                } else if (typeof response.data === 'string') {
                    // Fallback for text format
                    proxyList = response.data
                        .split('\n')
                        .filter(line => line.trim())
                        .slice(0, 50)
                        .map(proxy => {
                            const [ip, port] = proxy.trim().split(':');
                            return `http://${ip}:${port}`;
                        });
                }
                
                this.dynamicProxies = proxyList;
                this.lastRefresh = Date.now();
                this.failedProxies.clear(); // Reset failed proxies on refresh
                
                logger.success(`[PROXY-ROTATOR] Loaded ${this.dynamicProxies.length} fresh proxies from GeoNode`);
            } else {
                logger.warning('[PROXY-ROTATOR] Unexpected response from GeoNode');
            }
            
        } catch (error) {
            logger.error('[PROXY-ROTATOR] Failed to fetch proxies - Detailed error:', {
                message: error.message,
                code: error.code,
                response: error.response ? {
                    status: error.response.status,
                    statusText: error.response.statusText,
                    data: error.response.data ? String(error.response.data).substring(0, 500) : 'No data',
                    headers: error.response.headers
                } : 'No response object',
                stack: error.stack
            });
            // Keep existing proxies if refresh fails
        }
    }
    
    async getNextProxy(preferStable = true) {
        // Only use Webshare premium proxies
        if (this.stableProxies.length > 0) {
            // Find next working proxy
            let attempts = 0;
            while (attempts < this.stableProxies.length) {
                const proxy = this.stableProxies[this.currentStableIndex];
                this.currentStableIndex = (this.currentStableIndex + 1) % this.stableProxies.length;
                
                if (!this.failedProxies.has(proxy)) {
                    return this.formatProxy(proxy);
                }
                attempts++;
            }
            
            // If all proxies are marked as failed, reset and try again
            logger.warning('[PROXY-ROTATOR] All Webshare proxies marked as failed, resetting...');
            this.failedProxies.clear();
            
            // Return first proxy after reset
            const proxy = this.stableProxies[this.currentStableIndex];
            this.currentStableIndex = (this.currentStableIndex + 1) % this.stableProxies.length;
            return this.formatProxy(proxy);
        }
        
        // This shouldn't happen since we have 10 Webshare proxies
        logger.error('[PROXY-ROTATOR] No proxies available!');
        throw new Error('No proxies available');
    }
    
    formatProxy(proxyUrl) {
        try {
            const url = new URL(proxyUrl);
            return {
                url: proxyUrl,
                host: url.hostname,
                port: url.port || 80,
                auth: url.username ? {
                    username: url.username,
                    password: url.password
                } : undefined
            };
        } catch (error) {
            // Handle simple format IP:PORT
            const [host, port] = proxyUrl.replace('http://', '').split(':');
            return {
                url: proxyUrl,
                host,
                port: parseInt(port) || 80
            };
        }
    }
    
    markProxyFailed(proxyUrl) {
        this.failedProxies.add(proxyUrl);
        logger.warning(`[PROXY-ROTATOR] Marked proxy as failed: ${proxyUrl}`);
        
        // Update stats
        const stats = this.proxyStats.get(proxyUrl) || { success: 0, failed: 0 };
        stats.failed++;
        this.proxyStats.set(proxyUrl, stats);
        
        // Log warning if too many Webshare proxies failed
        if (this.failedProxies.size >= this.stableProxies.length * 0.5) {
            logger.warning(`[PROXY-ROTATOR] ${this.failedProxies.size}/${this.stableProxies.length} Webshare proxies have failed`);
        }
    }
    
    markProxySuccess(proxyUrl) {
        // Remove from failed list if it was there
        this.failedProxies.delete(proxyUrl);
        
        // Update stats
        const stats = this.proxyStats.get(proxyUrl) || { success: 0, failed: 0 };
        stats.success++;
        this.proxyStats.set(proxyUrl, stats);
    }
    
    getStats() {
        return {
            stableProxies: this.stableProxies.length,
            dynamicProxies: this.dynamicProxies.length,
            failedProxies: this.failedProxies.size,
            lastRefresh: new Date(this.lastRefresh).toISOString(),
            totalProxiesAvailable: this.stableProxies.length + this.dynamicProxies.length - this.failedProxies.size
        };
    }
}

// Singleton instance
module.exports = new ProxyRotator();