import type { FastifyBaseLogger } from 'fastify';
import type { ProfileData } from '../profile/profileOptions.js';
import type { ReadingStatus } from '../readingList/statuses.js';

// Client for the Smart Reading Coach AI service (the FastAPI project smart-reading-coach-ai).
// The service is optional: when it is not configured, not reachable or answers with an error,
// every method resolves to null or false, so the caller can fall back to the rule based advice.

// A title the student already has on the reading list, identified by the catalog key.
export interface AiHistoryItem {
    key: string;
    status: ReadingStatus;
    rating?: number; // 1 to 5 stars the student gave, the model weighs it in
}

// One recommendation as the AI service returns it.
export interface AiRecommendation {
    catalogCode: string;
    key: string;
    title: string;
    author: string | null;
    type: string;
    genre: string;
    level: string;
    score: number;
    reasons: string[]; // the separate reasons, shown to the teacher
    motivation: string; // Bo's short story about why it fits, shown to the student
}

interface AiRecommendationResponse {
    modelVersion: string;
    recommendations: AiRecommendation[];
}

export interface AiClient {
    recommend(
        profile: ProfileData,
        history: AiHistoryItem[],
        count: number,
    ): Promise<AiRecommendation[] | null>;
    isHealthy(): Promise<boolean>;
    // Asks the service to train a new model on the current catalog. True when training started.
    retrain(): Promise<boolean>;
}

export interface AiClientOptions {
    baseUrl: string;
    apiKey?: string | null;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
    log?: Pick<FastifyBaseLogger, 'warn'>;
}

const DEFAULT_TIMEOUT_MS = 3000;

function isRecommendationResponse(value: unknown): value is AiRecommendationResponse {
    if (typeof value !== 'object' || value === null) return false;
    const { recommendations } = value as { recommendations?: unknown };
    return (
        Array.isArray(recommendations) &&
        recommendations.every(
            (item) =>
                typeof item === 'object' &&
                item !== null &&
                typeof (item as AiRecommendation).key === 'string' &&
                typeof (item as AiRecommendation).motivation === 'string' &&
                Array.isArray((item as AiRecommendation).reasons),
        )
    );
}

export function createAiClient({
    baseUrl,
    apiKey,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
    log,
}: AiClientOptions): AiClient {
    const root = baseUrl.replace(/\/+$/, '');
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;

    return {
        async recommend(profile, history, count) {
            try {
                const response = await fetchImpl(`${root}/api/recommendations`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        profile: {
                            languageLevel: profile.languageLevel,
                            materialTypes: profile.materialTypes,
                            topics: profile.topics,
                            desiredLength: profile.desiredLength,
                            readingGoal: profile.readingGoal,
                        },
                        history,
                        count,
                    }),
                    signal: AbortSignal.timeout(timeoutMs),
                });
                if (!response.ok) {
                    log?.warn({ status: response.status }, 'AI service answered with an error');
                    return null;
                }
                const body: unknown = await response.json();
                if (!isRecommendationResponse(body)) {
                    log?.warn('AI service answered with an unexpected body');
                    return null;
                }
                return body.recommendations;
            } catch (err) {
                log?.warn({ err }, 'AI service is not reachable');
                return null;
            }
        },

        async retrain() {
            try {
                const response = await fetchImpl(`${root}/api/admin/retrain`, {
                    method: 'POST',
                    headers,
                    body: '{}',
                    signal: AbortSignal.timeout(timeoutMs),
                });
                if (!response.ok) {
                    log?.warn({ status: response.status }, 'AI service did not start training');
                    return false;
                }
                return true;
            } catch (err) {
                log?.warn({ err }, 'AI service is not reachable');
                return false;
            }
        },

        async isHealthy() {
            try {
                const response = await fetchImpl(`${root}/api/health`, {
                    signal: AbortSignal.timeout(timeoutMs),
                });
                if (!response.ok) return false;
                const body = (await response.json()) as { status?: unknown };
                return body.status === 'ok';
            } catch {
                return false;
            }
        },
    };
}
