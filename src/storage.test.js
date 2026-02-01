const storage = require('./storage');
const fs = require('fs');
const path = require('path');

describe('Storage Module', () => {
    const testVideoId = 'test_vid_123';

    test('toggleLike should add and then remove a like', async () => {
        // First like
        const status1 = await storage.toggleLike(testVideoId, { title: 'Test Video' });
        expect(status1).toBe(true);
        
        let isLiked = await storage.isLiked(testVideoId);
        expect(isLiked).toBe(true);

        // Unlike
        const status2 = await storage.toggleLike(testVideoId);
        expect(status2).toBe(false);

        isLiked = await storage.isLiked(testVideoId);
        expect(isLiked).toBe(false);
    });

    test('getLikes should return list of liked items', async () => {
        await storage.toggleLike('vid_A', { title: 'A' });
        await storage.toggleLike('vid_B', { title: 'B' });

        const likes = await storage.getLikes();
        expect(likes.length).toBeGreaterThanOrEqual(2);
        
        // Cleanup for tests
        await storage.toggleLike('vid_A');
        await storage.toggleLike('vid_B');
    });
});
