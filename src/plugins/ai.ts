import fp from 'fastify-plugin';
import { createAiClient } from '../advice/aiClient.js';

interface AiPluginOptions {
    baseUrl: string | null;
    apiKey: string | null;
    timeoutMs: number;
}

// Makes the AI service client available as fastify.ai. It is null when AI_SERVICE_URL is not set,
// then the advice uses the rules only.
export default fp<AiPluginOptions>(async (fastify, opts) => {
    const client = opts.baseUrl
        ? createAiClient({
              baseUrl: opts.baseUrl,
              apiKey: opts.apiKey,
              timeoutMs: opts.timeoutMs,
              log: fastify.log,
          })
        : null;
    fastify.decorate('ai', client);

    if (!client) {
        fastify.log.info('AI_SERVICE_URL is not set, the advice uses the rules only');
        return;
    }

    // On a free hosting plan the AI service sleeps when nobody uses it. A ping when the API starts
    // wakes it up, so it is usually ready by the time the first student asks for advice.
    fastify.addHook('onReady', async () => {
        void client.isHealthy().then((healthy) => {
            fastify.log.info({ healthy }, 'AI service checked at startup');
        });
    });
});
