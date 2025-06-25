const logger = require('./logger');

class EpisodeExtractor {
    /**
     * Extract episode pattern from filename with multiple format support
     */
    static extractEpisodePattern(filename) {
        if (!filename) return null;
        
        // Multiple patterns to try
        const patterns = [
            // S##E## or s##e## (most common)
            /[sS](\d{1,2})[eE](\d{1,2})/,
            // S##.E## or s##.e##
            /[sS](\d{1,2})\.?[eE](\d{1,2})/,
            // ##x## (like 4x13)
            /(\d{1,2})x(\d{1,2})/,
            // Season.##.Episode.##
            /[sS]eason\.?(\d{1,2})\.?[eE]pisode\.?(\d{1,2})/i,
            // Just numbers like 413 (for season 4 episode 13)
            /[^\d](\d)(\d{2})[^\d]/,
        ];
        
        for (const pattern of patterns) {
            const match = filename.match(pattern);
            if (match) {
                const season = match[1].padStart(2, '0');
                const episode = match[2].padStart(2, '0');
                return `S${season}E${episode}`;
            }
        }
        
        return null;
    }
    
    /**
     * Extract episode info from various sources
     */
    static extractFromMultipleSources(imdbId, videoFilename) {
        // First try IMDB ID format (tt1234567:4:13)
        if (imdbId && imdbId.includes(':')) {
            const parts = imdbId.split(':');
            if (parts.length === 3) {
                const season = parts[1].padStart(2, '0');
                const episode = parts[2].padStart(2, '0');
                logger.debug(`[EPISODE] Extracted from IMDB ID: S${season}E${episode}`);
                return `S${season}E${episode}`;
            }
        }
        
        // Then try filename
        if (videoFilename) {
            const pattern = this.extractEpisodePattern(videoFilename);
            if (pattern) {
                logger.debug(`[EPISODE] Extracted from filename: ${pattern}`);
                return pattern;
            }
        }
        
        return null;
    }
    
    /**
     * Check if subtitle matches episode with fuzzy matching
     */
    static subtitleMatchesEpisode(subtitleFilename, targetEpisode) {
        if (!targetEpisode) return true; // No episode filter
        
        const subtitleEpisode = this.extractEpisodePattern(subtitleFilename);
        
        // Direct match
        if (subtitleEpisode === targetEpisode) {
            return true;
        }
        
        // Check if subtitle contains all episodes (like "S04 Complete" or "Season 4")
        const seasonMatch = targetEpisode.match(/S(\d{2})/);
        if (seasonMatch) {
            const targetSeason = seasonMatch[1];
            const patterns = [
                new RegExp(`[sS]${targetSeason}.*complete`, 'i'),
                new RegExp(`[sS]eason.?${parseInt(targetSeason)}.*complete`, 'i'),
                new RegExp(`[sS]${targetSeason}.*all.*episodes`, 'i'),
                new RegExp(`[sS]${targetSeason}[^0-9]*$`, 'i'), // Just S04 without episode
            ];
            
            for (const pattern of patterns) {
                if (pattern.test(subtitleFilename)) {
                    logger.debug(`[EPISODE] Matched complete season pattern: ${subtitleFilename}`);
                    return true;
                }
            }
        }
        
        return false;
    }
}

module.exports = EpisodeExtractor;