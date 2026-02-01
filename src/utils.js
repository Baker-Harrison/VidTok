/**
 * VidTok Business Logic Utilities
 */

/**
 * Filters out short videos and maps them to a consistent format.
 */
function filterAndMapVideos(items) {
    return items.filter(item => {
        const duration = item.contentDetails?.duration;
        if (!duration) return true;
        const isShort = duration.startsWith('PT') && !duration.includes('M') && !duration.includes('H');
        return !isShort;
    }).map(item => ({
        id: item.id,
        title: item.snippet?.title || 'Untitled',
        url: `https://www.youtube.com/watch?v=${item.id}`,
        thumbnail: item.snippet?.thumbnails?.high?.url || '',
        duration: formatDuration(item.contentDetails?.duration || 'PT0S'),
        views: formatViews(item.statistics?.viewCount || '0')
    })).slice(0, 15);
}

/**
 * Converts ISO 8601 duration (PT1M20S) to readable (1:20)
 */
function formatDuration(iso) {
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '0:00';
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    
    const parts = [];
    if (hours > 0) parts.push(hours);
    parts.push(hours > 0 ? minutes.toString().padStart(2, '0') : minutes);
    parts.push(seconds.toString().padStart(2, '0'));
    
    return parts.join(':');
}

/**
 * Formats view counts (e.g. 1.2M)
 */
function formatViews(count) {
    const num = parseInt(count);
    if (isNaN(num)) return '0 views';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M views';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K views';
    return num + ' views';
}

module.exports = {
    filterAndMapVideos,
    formatDuration,
    formatViews
};
