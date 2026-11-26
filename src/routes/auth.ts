import type { FastifyInstance } from 'fastify';
import type { ChangePasswordDto } from '../dto/changePasswordDto.js';
import type { DeleteAccountDto } from '../dto/deleteAccountDto.js';
import type { LoginDto } from '../dto/loginDto.js';
import type { RegisterDto } from '../dto/registerDto.js';
import type { UpdateAccountDto } from '../dto/updateAccountDto.js';
import type { UserDto } from '../dto/userDto.js';
import { HttpError } from '../errors.js';
import { ok, problems, secured, wrap } from '../openapi/helpers.js';
import { createEmailTokenRepository } from '../repositories/emailTokenRepository.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createAccountMailService } from '../services/accountMailService.js';
import { createAccountService } from '../services/accountService.js';
import { createAuthService } from '../services/authService.js';
import { toUserDto } from '../services/mappingService.js';

const credentials = {
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: { type: 'string', minLength: 8, maxLength: 72 },
};

// A name in parts, so it can be shown and sorted the Dutch way ("van der Berg").
const nameParts = {
    firstName: { type: 'string', minLength: 1, maxLength: 60, description: 'Voornaam.' },
    infix: { type: 'string', maxLength: 20, description: 'Tussenvoegsel, for example "van der".' },
    lastName: { type: 'string', minLength: 1, maxLength: 80, description: 'Achternaam.' },
};

// A one-time link from an email: 32 random bytes, base64url.
const tokenField = { type: 'string', minLength: 20, maxLength: 200, pattern: '^[A-Za-z0-9_-]+$' };
const emailOnly = {
    type: 'object',
    required: ['email'],
    additionalProperties: false,
    properties: { email: credentials.email },
};
const tokenOnly = {
    type: 'object',
    required: ['token'],
    additionalProperties: false,
    properties: { token: tokenField },
};
const accepted = {
    202: {
        description:
            'Accepted. The same answer whether the address has an account or not, so addresses ' +
            'cannot be probed.',
        type: 'null',
    },
};

const registerSchema = {
    tags: ['Auth'],
    summary: 'Create a student account',
    description:
        'New accounts are students. A confirmation link is mailed to the address; logging in ' +
        'works after clicking it.',
    response: {
        201: ok('Registered', 'Account created, waiting for confirmation.'),
        ...problems(400, 409),
    },
    body: {
        type: 'object',
        required: ['email', 'password', 'firstName', 'lastName'],
        additionalProperties: false,
        properties: {
            ...credentials,
            ...nameParts,
        },
    },
};

const loginSchema = {
    tags: ['Auth'],
    summary: 'Log in with email and password',
    description: '403 when the email address is not confirmed yet.',
    response: { 200: ok('AuthResponse', 'Logged in.'), ...problems(400, 401, 403) },
    body: {
        type: 'object',
        required: ['email', 'password'],
        additionalProperties: false,
        properties: {
            email: credentials.email,
            password: { type: 'string', minLength: 1, maxLength: 72 },
        },
    },
};

const verifySchema = {
    tags: ['Auth'],
    summary: 'Confirm the email address with the link from the mail',
    description: 'Logs the user in: the response contains a token.',
    response: { 200: ok('AuthResponse', 'Confirmed and logged in.'), ...problems(400) },
    body: tokenOnly,
};

const resendSchema = {
    tags: ['Auth'],
    summary: 'Send the confirmation mail again',
    description: 'At most once a minute per account.',
    response: { ...accepted, ...problems(400) },
    body: emailOnly,
};

const forgotSchema = {
    tags: ['Auth'],
    summary: 'Mail a link to choose a new password',
    description: 'The link works for one hour, once. At most once a minute per account.',
    response: { ...accepted, ...problems(400) },
    body: emailOnly,
};

const resetSchema = {
    tags: ['Auth'],
    summary: 'Choose a new password with the link from the mail',
    description: 'Also confirms the email address. A notice is mailed afterwards.',
    response: {
        204: { description: 'Password changed. Log in with the new password.', type: 'null' },
        ...problems(400),
    },
    body: {
        type: 'object',
        required: ['token', 'newPassword'],
        additionalProperties: false,
        properties: { token: tokenField, newPassword: credentials.password },
    },
};

const confirmEmailSchema = {
    tags: ['Auth'],
    summary: 'Confirm a new email address with the link mailed to it',
    description: 'Works without being logged in, the link proves who it is.',
    response: {
        200: wrap('user', 'User', 'The user with the new email address.'),
        ...problems(400, 409),
    },
    body: tokenOnly,
};

const meSchema = {
    tags: ['Auth'],
    summary: 'Get the logged in user',
    security: secured,
    response: { 200: wrap('user', 'User', 'The logged in user.'), ...problems(401) },
};

const updateMeSchema = {
    tags: ['Auth'],
    summary:
        'Change the name (first name, infix, last name) or email address of the logged in user',
    description:
        'Send only what changes. A new email address also needs the current password, so nobody ' +
        'can take over an account from an unlocked computer. It is not changed right away: a ' +
        'link is mailed to the new address (pendingEmail until then) and a notice to the old one.',
    security: secured,
    response: {
        200: wrap('user', 'User', 'The updated user.'),
        ...problems(400, 401, 409),
    },
    body: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
            ...nameParts,
            email: credentials.email,
            currentPassword: { type: 'string', minLength: 1, maxLength: 72 },
        },
    },
};

const passwordSchema = {
    tags: ['Auth'],
    summary: 'Change the password of the logged in user',
    security: secured,
    response: {
        204: {
            description: 'Password changed, a notice is mailed. The current token stays valid.',
            type: 'null',
        },
        ...problems(400, 401),
    },
    body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        additionalProperties: false,
        properties: {
            currentPassword: { type: 'string', minLength: 1, maxLength: 72 },
            newPassword: credentials.password,
        },
    },
};

const deleteMeSchema = {
    tags: ['Auth'],
    summary: 'Delete the account of the logged in user',
    description:
        'Removes the account with its reading profile, reading list and teacher links. Cannot be ' +
        'undone. Needs the current password.',
    security: secured,
    response: {
        204: { description: 'Account removed. The token no longer works.', type: 'null' },
        ...problems(400, 401),
    },
    body: {
        type: 'object',
        required: ['currentPassword'],
        additionalProperties: false,
        properties: {
            currentPassword: { type: 'string', minLength: 1, maxLength: 72 },
        },
    },
};

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
    const userRepository = createUserRepository(fastify.db);
    const authService = createAuthService({ userRepository });
    const accountMailService = createAccountMailService({
        userRepository,
        emailTokenRepository: createEmailTokenRepository(fastify.db),
        mailer: fastify.mail.mailer,
        appUrl: fastify.mail.appUrl,
    });
    const accountService = createAccountService({ userRepository, accountMailService });

    const issueToken = (user: UserDto): string =>
        fastify.jwt.sign({ sub: user.id, role: user.role });

    fastify.post<{ Body: RegisterDto }>(
        '/auth/register',
        { schema: registerSchema },
        async (request, reply) => {
            const user = await authService.register(request.body);
            await accountMailService.sendVerification(user, request.locale);
            return reply.code(201).send({ email: user.email });
        },
    );

    fastify.post<{ Body: { token: string } }>(
        '/auth/verify-email',
        { schema: verifySchema },
        async (request) => {
            const user = toUserDto(await accountMailService.verifyEmail(request.body.token));
            return { token: issueToken(user), user };
        },
    );

    fastify.post<{ Body: { email: string } }>(
        '/auth/verify-email/resend',
        { schema: resendSchema },
        async (request, reply) => {
            await accountMailService.resendVerification(request.body.email, request.locale);
            return reply.code(202).send();
        },
    );

    fastify.post<{ Body: { email: string } }>(
        '/auth/password/forgot',
        { schema: forgotSchema },
        async (request, reply) => {
            await accountMailService.requestPasswordReset(request.body.email, request.locale);
            return reply.code(202).send();
        },
    );

    fastify.post<{ Body: { token: string; newPassword: string } }>(
        '/auth/password/reset',
        { schema: resetSchema },
        async (request, reply) => {
            await accountMailService.resetPassword(
                request.body.token,
                request.body.newPassword,
                request.locale,
            );
            return reply.code(204).send();
        },
    );

    fastify.post<{ Body: { token: string } }>(
        '/auth/email/confirm',
        { schema: confirmEmailSchema },
        async (request) => {
            const user = await accountMailService.confirmEmailChange(request.body.token);
            return { user: toUserDto(user, await accountMailService.pendingEmail(user.id)) };
        },
    );

    fastify.post<{ Body: LoginDto }>('/auth/login', { schema: loginSchema }, async (request) => {
        const user = await authService.login(request.body);
        return { token: issueToken(user), user };
    });

    fastify.get(
        '/auth/me',
        { preHandler: fastify.authenticate, schema: meSchema },
        async (request) => {
            const user = await userRepository.findById(request.user.sub);
            if (!user) throw new HttpError(401, 'auth.accountGone');
            return { user: toUserDto(user, await accountMailService.pendingEmail(user.id)) };
        },
    );

    fastify.patch<{ Body: UpdateAccountDto }>(
        '/auth/me',
        { preHandler: fastify.authenticate, schema: updateMeSchema },
        async (request) => ({
            user: await accountService.updateAccount(
                request.user.sub,
                request.body,
                request.locale,
            ),
        }),
    );

    fastify.put<{ Body: ChangePasswordDto }>(
        '/auth/me/password',
        { preHandler: fastify.authenticate, schema: passwordSchema },
        async (request, reply) => {
            await accountService.changePassword(request.user.sub, request.body, request.locale);
            return reply.code(204).send();
        },
    );

    fastify.delete<{ Body: DeleteAccountDto }>(
        '/auth/me',
        { preHandler: fastify.authenticate, schema: deleteMeSchema },
        async (request, reply) => {
            await accountService.deleteAccount(
                request.user.sub,
                request.body.currentPassword,
                request.locale,
            );
            return reply.code(204).send();
        },
    );
}
