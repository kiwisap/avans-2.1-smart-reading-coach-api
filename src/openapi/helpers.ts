// Small helpers to describe routes in the OpenAPI document without repeating the same blocks.

export const secured = [{ bearerAuth: [] }];

const PROBLEM_DESCRIPTIONS: Record<number, string> = {
    400: 'Invalid input.',
    401: 'Not logged in, or the token is invalid or expired.',
    403: 'The role of this user is not allowed to do this.',
    404: 'Not found.',
    409: 'Conflict with the current state.',
};

// Error responses: every status below is a ProblemDetails object.
export function problems(...statuses: number[]): Record<number, object> {
    return Object.fromEntries(
        statuses.map((status) => [
            status,
            {
                description: PROBLEM_DESCRIPTIONS[status] ?? 'Error.',
                content: { 'application/problem+json': { schema: { $ref: 'ProblemDetails#' } } },
            },
        ]),
    );
}

// Success response that points to a shared schema.
export function ok(ref: string, description = 'Success.'): object {
    return { description, $ref: `${ref}#` };
}

// Same for a response with an object that wraps a shared schema, like { item: ReadingListItem }.
export function wrap(key: string, ref: string, description = 'Success.', array = false): object {
    const inner = { $ref: `${ref}#` };
    return {
        description,
        type: 'object',
        required: [key],
        properties: { [key]: array ? { type: 'array', items: inner } : inner },
    };
}

// A shared schema or null. In OpenAPI 3.0 "nullable" next to allOf or $ref does not let null pass,
// so null is a second option of its own.
export function nullableRef(ref: string, description?: string): object {
    return {
        ...(description ? { description } : {}),
        anyOf: [{ $ref: `${ref}#` }, { type: 'object', nullable: true, enum: [null] }],
    };
}
