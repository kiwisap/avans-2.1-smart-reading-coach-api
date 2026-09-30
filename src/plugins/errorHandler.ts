import fp from 'fastify-plugin';

// Dutch messages for the errors Fastify creates itself (invalid input, unknown route, crashes).
// Errors thrown by our own services are HttpErrors and already carry a Dutch message.
const FIELD_NAMES: Record<string, string> = {
    email: 'e-mailadres',
    password: 'wachtwoord',
    name: 'naam',
    languageLevel: 'leesniveau',
    materialTypes: 'soorten teksten',
    topics: 'onderwerpen',
    desiredLength: 'lengte',
    readingGoal: 'reden om te lezen',
    bookId: 'titel',
    status: 'status',
};

interface ValidationIssue {
    keyword: string;
    instancePath: string;
    params: Record<string, unknown>;
}

function describeIssue(issue: ValidationIssue): string {
    const key =
        issue.keyword === 'required'
            ? String(issue.params.missingProperty)
            : (issue.instancePath.split('/').filter(Boolean)[0] ?? '');
    const field = FIELD_NAMES[key] ?? 'invoer';

    switch (issue.keyword) {
        case 'required':
            return `Het veld ${field} is verplicht`;
        case 'format':
            return key === 'email'
                ? 'Vul een geldig e-mailadres in'
                : `Het veld ${field} heeft een ongeldig formaat`;
        case 'minLength':
            return key === 'password'
                ? 'Het wachtwoord moet minimaal 8 tekens lang zijn'
                : `Het veld ${field} is niet ingevuld`;
        case 'maxLength':
            return `Het veld ${field} is te lang`;
        default:
            return `Het veld ${field} is ongeldig`;
    }
}

export default fp(async (fastify) => {
    fastify.setNotFoundHandler((_request, reply) => {
        void reply
            .status(404)
            .send({ statusCode: 404, error: 'Not Found', message: 'Pagina niet gevonden' });
    });

    fastify.setErrorHandler((error, request, reply) => {
        const validation = (error as { validation?: ValidationIssue[] }).validation;
        if (validation && validation.length > 0) {
            const first = validation[0] as ValidationIssue;
            return reply
                .status(400)
                .send({ statusCode: 400, error: 'Bad Request', message: describeIssue(first) });
        }

        const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
        if (statusCode >= 500) {
            request.log.error(error);
            return reply.status(statusCode).send({
                statusCode,
                error: 'Internal Server Error',
                message: 'Er is iets misgegaan op de server. Probeer het later opnieuw.',
            });
        }
        return reply.status(statusCode).send({
            statusCode,
            error: error instanceof Error ? error.name : 'Error',
            message: error instanceof Error ? error.message : 'Er is iets misgegaan',
        });
    });
});
