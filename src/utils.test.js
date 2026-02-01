const { formatDuration, formatViews, filterAndMapVideos } = require('./utils');

describe('Utility Logic', () => {
    describe('formatDuration', () => {
        test('should convert seconds only', () => {
            expect(formatDuration('PT45S')).toBe('0:45');
        });
        test('should convert minutes and seconds', () => {
            expect(formatDuration('PT1M20S')).toBe('1:20');
        });
        test('should convert hours, minutes and seconds', () => {
            expect(formatDuration('PT1H05M30S')).toBe('1:05:30');
        });
    });

    describe('formatViews', () => {
        test('should format millions', () => {
            expect(formatViews('1200000')).toBe('1.2M views');
        });
        test('should format thousands', () => {
            expect(formatViews('5500')).toBe('5.5K views');
        });
        test('should handle small numbers', () => {
            expect(formatViews('123')).toBe('123 views');
        });
    });

    describe('filterAndMapVideos', () => {
        test('should filter out Shorts', () => {
            const mockItems = [
                {
                    id: 'short1',
                    contentDetails: { duration: 'PT30S' },
                    snippet: { title: 'Short' },
                    statistics: { viewCount: '100' }
                },
                {
                    id: 'long1',
                    contentDetails: { duration: 'PT5M00S' },
                    snippet: { title: 'Long' },
                    statistics: { viewCount: '1000' }
                }
            ];
            const result = filterAndMapVideos(mockItems);
            expect(result.length).toBe(1);
            expect(result[0].id).toBe('long1');
        });
    });
});
