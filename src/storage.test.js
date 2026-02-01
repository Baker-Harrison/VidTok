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

    test('isLiked should return false for unknown videos', async () => {
        const liked = await storage.isLiked('unknown_id');
        expect(liked).toBe(false);
    });
});
