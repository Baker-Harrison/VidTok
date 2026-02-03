-- VidTok Smart Search Schema
-- Targets PostgreSQL with pgvector extension

-- Enable the pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Core Videos Table
CREATE TABLE videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Full-text search vector for BM25-style keyword matching
    tsv tsvector GENERATED ALWAYS AS (
        to_tsvector('english', title || ' ' || COALESCE(description, ''))
    ) STORED
);

-- Vector Embeddings for Semantic Search
-- dimensional length matches nomic-embed-text-v1.5 (768)
CREATE TABLE video_embeddings (
    video_id UUID PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
    embedding vector(768) NOT NULL
);

-- User Watch History for Personalization
CREATE TABLE watch_history (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User Likes for Personalization
CREATE TABLE likes (
    user_id UUID NOT NULL,
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, video_id)
);

-- Indexes
CREATE INDEX idx_videos_tsv ON videos USING GIN (tsv);
CREATE INDEX idx_video_embeddings_vector ON video_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_watch_history_user_video ON watch_history(user_id, video_id);
CREATE INDEX idx_likes_user_video ON likes(user_id, video_id);
CREATE INDEX idx_videos_channel ON videos(channel_id);
