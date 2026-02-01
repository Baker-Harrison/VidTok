const storage = require('./storage');

describe('VidTok Desktop Business Logic', () => {
    test('Preferences should save and retrieve correctly', async () => {
        const testChannels = ['MKBHD', 'Veritasium'];
        const testTopics = ['Tech', 'Science'];
        
        await storage.savePreferences(testChannels, testTopics);
        const prefs = await storage.getPreferences();
        
        expect(prefs.channels).toEqual(testChannels);
        expect(prefs.topics).toEqual(testTopics);
    });

    test('Settings should save and retrieve correctly', async () => {
        const testSettings = { volume: 0.5, muted: true };
        await storage.saveSettings(testSettings);
        
        const settings = await storage.getSettings();
        expect(settings.volume).toBe(0.5);
        expect(settings.muted).toBe(true);
    });

    test('Playback position should save and retrieve correctly', async () => {
        await storage.savePlaybackPosition('vid_pos_test', 45.5);
        const pos = await storage.getPlaybackPosition('vid_pos_test');
        expect(pos).toBe(45.5);
    });

    test('isLiked should return false for unknown videos', async () => {
        const liked = await storage.isLiked('unknown_id');
        expect(liked).toBe(false);
    });

    test('Viewed videos should be stored and filtered by timestamp', async () => {
        const idA = `view_test_a_${Date.now()}`;
        const idB = `view_test_b_${Date.now()}`;
        const before = Date.now();

        await storage.markViewed(idA);
        await storage.markViewed(idB);

        const recentIds = await storage.getViewedIds(before - 1000);
        expect(recentIds).toContain(idA);
        expect(recentIds).toContain(idB);

        const futureIds = await storage.getViewedIds(Date.now() + 1000);
        expect(futureIds).not.toContain(idA);
        expect(futureIds).not.toContain(idB);
    });
});
