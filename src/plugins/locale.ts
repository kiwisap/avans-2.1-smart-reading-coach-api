import fp from 'fastify-plugin';
import { DEFAULT_LOCALE, resolveLocale } from '../i18n.js';

// Reads the language the client asked for (Accept-Language header) and puts it on the request,
// so everything the backend writes in words (errors, advice texts) is in that language.
export default fp(async (fastify) => {
    fastify.decorateRequest('locale', DEFAULT_LOCALE);

    fastify.addHook('onRequest', async (request, reply) => {
        request.locale = resolveLocale(request.headers['accept-language']);
        void reply.header('Content-Language', request.locale);
        void reply.header('Vary', 'Accept-Language');
    });
});
