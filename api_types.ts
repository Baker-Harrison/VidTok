/**
 * VidTok Search API Type Definitions
 */

export interface SearchRequest {
    /** The raw search string from the user */
    query: string;
    
    /** The ID of the user performing the search (for personalization) */
    userId: string;
    
    /** Pagination: Number of results to return */
    limit?: number;
    
    /** Pagination: Offset for results */
    offset?: number;
    
    /** Optional filters */
    filters?: {
        channelId?: string;
        tags?: string[];
        fromDate?: string; // ISO format
    };
}

export interface SearchResult {
    /** Unique video identifier */
    id: string;
    
    /** Video metadata */
    video: {
        title: string;
        description: string;
        channelId: string;
        thumbnailUrl: string;
        createdAt: string;
        tags: string[];
    };
    
    /** Scoring breakdown for debugging/explainability */
    scoring: {
        total: number;
        keywordScore: number;
        vectorScore: number;
        personalizationScore: number;
    };
    
    /** Why this video was recommended (e.g., "From a channel you liked") */
    recommendationReason?: string;
}

export interface SearchResponse {
    results: SearchResult[];
    totalResults: number;
    queryTimeMs: number;
    /** The model used for generating query embeddings */
    model: string;
}

/** Error responses */
export interface SearchError {
    error: string;
    code: 'QUERY_TOO_SHORT' | 'SERVER_ERROR' | 'UNAUTHORIZED';
}
