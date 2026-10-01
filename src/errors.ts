import { describeError, type ErrorCode, type MessageParams } from './i18n.js';

// An error with an HTTP status and a code such as "auth.emailTaken". The code never leaves the
// backend: the error handler turns it into a text in the language of the request. The message
// here is in the default language and only meant for logs.
// Fastify uses err.statusCode to pick the HTTP status of the response.
export class HttpError extends Error {
    readonly statusCode: number;
    readonly code: ErrorCode;
    readonly params: MessageParams | undefined;

    constructor(statusCode: number, code: ErrorCode, params?: MessageParams) {
        super(describeError(code, params));
        this.statusCode = statusCode;
        this.code = code;
        this.params = params;
    }
}
