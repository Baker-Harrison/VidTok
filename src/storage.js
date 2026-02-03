const Datastore = require('nedb-promises');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

/**
 * VidTok Persistent Storage Engine
 * Manages user data such as likes and viewing history.
 */
class Storage {
    constructor() {
        let userDataPath;
        try {
            userDataPath = app ? app.getPath('userData') : path.join(__dirname, '../data');
        } catch (e) {
            // Fallback for test environment
            userDataPath = path.join(__dirname, '../data');
        }

        if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true });
        }
        this.db = Datastore.create({
            filename: path.join(userDataPath, 'vidtok_user.db'),
            autoload: true
        });
    }

    async getPreferences() {
        return await this.db.findOne({ type: 'preferences' });
    }

    async savePreferences(channels, topics) {
        await this.db.remove({ type: 'preferences' }, { multi: true });
        return await this.db.insert({
            type: 'preferences',
            channels,
            topics,
            timestamp: Date.now()
        });
    }

    async getSettings() {
        return await this.db.findOne({ type: 'settings' }) || { volume: 1.0, muted: false };
    }

    async saveSettings(settings) {
        await this.db.update(
            { type: 'settings' },
            { $set: { ...settings, type: 'settings' } },
            { upsert: true }
        );
    }

    async savePlaybackPosition(videoId, position) {
        await this.db.update(
            { type: 'playback', videoId },
            { $set: { position, timestamp: Date.now() } },
            { upsert: true }
        );
    }

    async getPlaybackPosition(videoId) {
        const result = await this.db.findOne({ type: 'playback', videoId });
        return result ? result.position : 0;
    }

    /**
     * Toggles a 'like' status for a video.
     * @returns {boolean} New like status
     */
    async toggleLike(videoId, metadata) {
        const existing = await this.db.findOne({ type: 'like', videoId });
        if (existing) {
            await this.db.remove({ _id: existing._id });
            return false;
        } else {
            await this.db.insert({
                type: 'like',
                videoId,
                timestamp: Date.now(),
                ...metadata
            });
            return true;
        }
    }

    /**
     * Checks if a video is liked.
     */
    async isLiked(videoId) {
        const result = await this.db.findOne({ type: 'like', videoId });
        return !!result;
    }

    /**
     * Gets all liked videos.
     */
    async getLikes() {
        return await this.db.find({ type: 'like' }).sort({ timestamp: -1 });
    }

    /**
     * Marks a video as viewed with a fresh timestamp.
     */
    async markViewed(videoId) {
        await this.db.update(
            { type: 'view', videoId },
            { $set: { type: 'view', videoId, timestamp: Date.now() } },
            { upsert: true }
        );
    }

    /**
     * Returns viewed video IDs since a given timestamp.
     */
    async getViewedIds(sinceTimestamp) {
        const records = await this.db.find({
            type: 'view',
            timestamp: { $gte: sinceTimestamp }
        });
        return Array.from(new Set(records.map(record => record.videoId)));
    }

    /**
     * Returns all viewed video IDs.
     */
    async getAllViewedIds() {
        const records = await this.db.find({ type: 'view' });
        return Array.from(new Set(records.map(record => record.videoId)));
    }
}

module.exports = new Storage();
