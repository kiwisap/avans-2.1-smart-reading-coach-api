import { STATUS_CODES } from 'node:http';
import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { HttpError } from '../errors.js';
import { describeError, type ErrorCode, type MessageParams } from '../i18n.js';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8';

// Every error response is a problem details object (RFC 9457, application/problem+json).
// `detail` is the text for the user, in the language of the request (Accept-Language header).
// Error codes stay inside the backend, the client does not need them.
export interface ProblemDetails {
    type: string;
    title: string;
    status: number;
    detail: string;
    instance: string;
}

const KNOWN_FIELDS = new Set([
    'email',
    'password',
    'name',
    'languageLevel',
    'materialTypes',
    'topics',
    'desiredLength',
    'readingGoal',
    'bookId',
    'status',
]);

interface ValidationIssue {
    keyword: string;
    instancePath: string;
    params: Record<string, unknown>;
}

// Translates a schema validation problem (invalid input) to an error code.
export function describeIssue(issue: ValidationIssue): { code: ErrorCode; params?: MessageParams } {
    const key =
        issue.keyword === 'required'
            ? String(issue.params.missingProperty)
            : (issue.instancePath.split('/').filter(Boolean)[0] ?? '');
    const field = KNOWN_FIELDS.has(key) ? key : 'input';

    switch (issue.keyword) {
        case 'required':
            return { code: 'validation.required', params: { field } };
        case 'format':
            return key === 'email'
                ? { code: 'validation.invalidEmail' }
                : { code: 'validation.invalidFormat', params: { field } };
        case 'minLength':
            return key === 'password'
                ? {
                      code: 'validation.passwordTooShort',
                      params: { min: Number(issue.params.limit) },
                  }
                : { code: 'validation.empty', params: { field } };
        case 'maxLength':
            return { code: 'validation.tooLong', params: { field } };
        default:
            return { code: 'validation.invalid', params: { field } };
    }
}

function problem(
    request: FastifyRequest,
    status: number,
    code: ErrorCode,
    params?: MessageParams,
): ProblemDetails {
    return {
        type: 'about:blank', // no extra meaning beyond the HTTP status (RFC 9457, section 4.2.1)
        title: STATUS_CODES[status] ?? 'Error',
        status,
        detail: describeError(code, params, request.locale),
        instance: request.url,
    };
}

export default fp(async (fastify) => {
    fastify.setNotFoundHandler((request, reply) => {
        void reply
            .status(404)
            .type(PROBLEM_CONTENT_TYPE)
            .send(problem(request, 404, 'generic.notFound'));
    });

    fastify.setErrorHandler((error, request, reply) => {
        const send = (status: number, code: ErrorCode, params?: MessageParams) =>
            reply
                .status(status)
                .type(PROBLEM_CONTENT_TYPE)
                .send(problem(request, status, code, params));

        const validation = (error as { validation?: ValidationIssue[] }).validation;
        if (validation && validation.length > 0) {
            const { code, params } = describeIssue(validation[0] as ValidationIssue);
            return send(400, code, params);
        }

        if (error instanceof HttpError) {
            return send(error.statusCode, error.code, error.params);
        }

        // Errors Fastify creates itself (broken JSON, wrong content type) and real crashes.
        // Technical details of a crash stay in the log, not in the response.
        const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
        if (statusCode >= 500) {
            request.log.error(error);
            return send(statusCode, 'generic.server');
        }
        return send(statusCode, 'generic.badRequest');
    });
});
