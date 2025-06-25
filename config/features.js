// Feature toggles configuration
module.exports = {
    // Enable/disable proxy rotation for avoiding rate limiting
    useProxies: true, // Set to true to enable proxy rotation
    
    // Enable/disable series episode caching
    useSeriesCache: true, // Enabled by default
    
    // Enable/disable preloading next episodes
    preloadNextEpisodes: true, // Enabled by default
    
    // Number of episodes to preload ahead
    preloadCount: 3,
    
    // Cache duration in hours (30 days = 720 hours)
    cacheDuration: 720
};