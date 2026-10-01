import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { HttpError } from '../src/errors.js';
import locale from '../src/plugins/locale.js';
import errorHandler, {
    describeIssue,
    PROBLEM_CONTENT_TYPE,
    type ProblemDetails,
} from '../src/plugins/errorHandler.js';

async function buildApp() {
    const app = Fastify();
    await app.register(locale);
    await app.register(errorHandler);
    app.get('/taken', () => {
        throw new HttpError(409, 'auth.emailTaken');
    });
    app.get('/too-many', () => {
        throw new HttpError(400, 'profile.tooManyTopics', { max: 5 });
    });
    app.get('/crash', () => {
        throw new Error('database password is hunter2');
    });
    app.post(
        '/register',
        {
            schema: {
                body: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: { type: 'string', format: 'email' },
                        password: { type: 'string', minLength: 8 },
                    },
                },
            },
        },
        () => ({ ok: true }),
    );
    return app;
}

describe('HttpError', () => {
    it('carries the code and parameters and a readable message', () => {
        const err = new HttpError(400, 'profile.tooManyTopics', { max: 5 });
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'profile.tooManyTopics');
        assert.deepEqual(err.params, { max: 5 });
        assert.equal(err.message, 'Kies maximaal 5 onderwerpen');
    });
});

describe('describeIssue', () => {
    it('maps schema keywords to error codes', () => {
        const issue = (
            keyword: string,
            instancePath: string,
            params: Record<string, unknown> = {},
        ) => describeIssue({ keyword, instancePath, params });
        assert.deepEqual(issue('required', '', { missingProperty: 'name' }), {
            code: 'validation.required',
            params: { field: 'name' },
        });
        assert.deepEqual(issue('format', '/email'), { code: 'validation.invalidEmail' });
        assert.deepEqual(issue('minLength', '/password', { limit: 8 }), {
            code: 'validation.passwordTooShort',
            params: { min: 8 },
        });
        assert.deepEqual(issue('maxLength', '/name'), {
            code: 'validation.tooLong',
            params: { field: 'name' },
        });
        assert.deepEqual(issue('type', '/unknown'), {
            code: 'validation.invalid',
            params: { field: 'input' },
        });
    });
});

describe('error responses', () => {
    it('sends a problem details object with a text for the user', async () => {
        const app = await buildApp();
        const response = await app.inject('/taken');
        const body = response.json<ProblemDetails>();
        assert.equal(response.statusCode, 409);
        assert.equal(body.type, 'about:blank');
        assert.equal(body.title, 'Conflict');
        assert.equal(body.status, 409);
        assert.equal(body.detail, 'Er bestaat al een account met dit e-mailadres');
        assert.equal(body.instance, '/taken');
    });

    it('does not send error codes or parameters', async () => {
        const app = await buildApp();
        const body = (await app.inject('/too-many')).json<Record<string, unknown>>();
        assert.deepEqual(Object.keys(body).sort(), [
            'detail',
            'instance',
            'status',
            'title',
            'type',
        ]);
        assert.equal(body.detail, 'Kies maximaal 5 onderwerpen');
    });

    it('uses the problem details media type and says which language it used', async () => {
        const app = await buildApp();
        for (const url of ['/taken', '/crash', '/bestaat-niet']) {
            const response = await app.inject({ url, headers: { 'accept-language': 'nl-NL' } });
            assert.equal(response.headers['content-type'], PROBLEM_CONTENT_TYPE);
            assert.equal(response.headers['content-language'], 'nl');
        }
    });

    it('falls back to the default language for a language it does not have', async () => {
        const app = await buildApp();
        const response = await app.inject({ url: '/taken', headers: { 'accept-language': 'fr' } });
        assert.equal(response.headers['content-language'], 'nl');
        assert.equal(
            response.json<ProblemDetails>().detail,
            'Er bestaat al een account met dit e-mailadres',
        );
    });

    it('turns invalid input into a readable text', async () => {
        const app = await buildApp();
        const post = async (payload: object) =>
            (
                await app.inject({ method: 'POST', url: '/register', payload })
            ).json<ProblemDetails>();

        assert.equal(
            (await post({ email: 'geen-email', password: 'abcdefgh' })).detail,
            'Vul een geldig e-mailadres in',
        );
        assert.equal(
            (await post({ email: 'a@b.nl', password: 'abc' })).detail,
            'Het wachtwoord moet minimaal 8 tekens lang zijn',
        );
        assert.equal((await post({ email: 'a@b.nl' })).detail, 'Het veld wachtwoord is verplicht');
    });

    it('answers an unknown route with a 404', async () => {
        const app = await buildApp();
        const response = await app.inject('/bestaat-niet');
        assert.equal(response.statusCode, 404);
        assert.equal(response.json<ProblemDetails>().status, 404);
    });

    it('does not leak details of a crash', async () => {
        const app = await buildApp();
        const response = await app.inject('/crash');
        assert.equal(response.statusCode, 500);
        assert.ok(!response.body.includes('hunter2'));
    });

    it('answers broken JSON with a 400', async () => {
        const app = await buildApp();
        const response = await app.inject({
            method: 'POST',
            url: '/register',
            headers: { 'content-type': 'application/json' },
            payload: '{kapot',
        });
        assert.equal(response.statusCode, 400);
        assert.equal(response.json<ProblemDetails>().status, 400);
    });
});
