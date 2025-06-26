// Feature toggles configuration
module.exports = {
    // Enable/disable proxy rotation for avoiding rate limiting
    useProxies: process.env.DISABLE_PROXIES === 'true' ? false : false, // Disabled by default for production
    
    // Enable/disable series episode caching
    useSeriesCache: process.env.ENABLE_CACHE !== 'false', // Enabled by default
    
    // Enable/disable preloading next episodes
    preloadNextEpisodes: process.env.ENABLE_CACHE !== 'false', // Enabled by default
    
    // Number of episodes to preload ahead
    preloadCount: 3,
    
    // Cache duration in hours (30 days = 720 hours)
    cacheDuration: parseInt(process.env.CACHE_DURATION_HOURS) || 720
};