import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAiClient } from '../src/advice/aiClient.js';
import type { ProfileData } from '../src/profile/profileOptions.js';

const profile: ProfileData = {
    languageLevel: '2F',
    materialTypes: ['boek'],
    topics: ['vriendschap'],
    desiredLength: 'medium',
    readingGoal: 'enjoyment',
};

const answer = {
    modelVersion: '1.0.0',
    recommendations: [
        {
            cataloguscode: 'CAT-00120',
            key: 'heartstopper 3|alice oseman|boek',
            title: 'Heartstopper 3',
            author: 'Alice Oseman',
            type: 'boek',
            genre: 'fictie',
            level: '2F',
            score: 0.91,
            reasons: ['Het gaat over vriendschap.'],
            summary: 'Het gaat over vriendschap.',
        },
    ],
};

interface Call {
    url: string;
    init: RequestInit | undefined;
}

// A fetch that records the request and answers with a fixed response or throws.
function fakeFetch(respond: () => Response) {
    const calls: Call[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return respond();
    }) as typeof fetch;
    return { fetchImpl, calls };
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('aiClient', () => {
    it('posts the profile, history and count and returns the recommendations', async () => {
        const { fetchImpl, calls } = fakeFetch(() => json(answer));
        const client = createAiClient({ baseUrl: 'http://ai:8000/', apiKey: 'geheim', fetchImpl });

        const result = await client.recommend(profile, [{ key: 'a||boek', status: 'read' }], 5);

        assert.equal(result?.[0]?.title, 'Heartstopper 3');
        assert.equal(calls[0]?.url, 'http://ai:8000/api/recommendations');
        const headers = calls[0]?.init?.headers as Record<string, string>;
        assert.equal(headers['x-api-key'], 'geheim');
        const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
        assert.deepEqual(body.history, [{ key: 'a||boek', status: 'read' }]);
        assert.equal(body.count, 5);
        assert.equal((body.profile as ProfileData).languageLevel, '2F');
    });

    it('sends no api key header when no key is configured', async () => {
        const { fetchImpl, calls } = fakeFetch(() => json(answer));
        await createAiClient({ baseUrl: 'http://ai:8000', fetchImpl }).recommend(profile, [], 3);
        const headers = calls[0]?.init?.headers as Record<string, string>;
        assert.equal(headers['x-api-key'], undefined);
    });

    it('returns null on an error response, so the caller can fall back', async () => {
        const { fetchImpl } = fakeFetch(() => json({ title: 'Niet geautoriseerd' }, 401));
        const client = createAiClient({ baseUrl: 'http://ai:8000', fetchImpl });
        assert.equal(await client.recommend(profile, [], 5), null);
    });

    it('returns null when the service is not reachable', async () => {
        const { fetchImpl } = fakeFetch(() => {
            throw new TypeError('fetch failed');
        });
        const client = createAiClient({ baseUrl: 'http://ai:8000', fetchImpl });
        assert.equal(await client.recommend(profile, [], 5), null);
        assert.equal(await client.isHealthy(), false);
    });

    it('returns null when the answer does not look like recommendations', async () => {
        const { fetchImpl } = fakeFetch(() => json({ something: 'else' }));
        const client = createAiClient({ baseUrl: 'http://ai:8000', fetchImpl });
        assert.equal(await client.recommend(profile, [], 5), null);
    });

    it('reports healthy only when the service has a model', async () => {
        const ready = createAiClient({
            baseUrl: 'http://ai:8000',
            fetchImpl: fakeFetch(() => json({ status: 'ok', modelVersion: '1.0.0' })).fetchImpl,
        });
        const untrained = createAiClient({
            baseUrl: 'http://ai:8000',
            fetchImpl: fakeFetch(() => json({ status: 'geen model', modelVersion: null }))
                .fetchImpl,
        });
        assert.equal(await ready.isHealthy(), true);
        assert.equal(await untrained.isHealthy(), false);
    });
});
