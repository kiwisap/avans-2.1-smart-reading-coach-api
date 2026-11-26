import type { FastifyInstance } from 'fastify';
import type { ChangePasswordDto } from '../dto/changePasswordDto.js';
import type { DeleteAccountDto } from '../dto/deleteAccountDto.js';
import type { LoginDto } from '../dto/loginDto.js';
import type { RegisterDto } from '../dto/registerDto.js';
import type { UpdateAccountDto } from '../dto/updateAccountDto.js';
import type { UserDto } from '../dto/userDto.js';
import { HttpError } from '../errors.js';
import { ok, problems, secured, wrap } from '../openapi/helpers.js';
import { createUserRepository } from '../repositories/userRepository.js';
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

const registerSchema = {
    tags: ['Auth'],
    summary: 'Create a student account',
    description:
        'New accounts are students. The response contains a token, so the user is logged in.',
    response: { 201: ok('AuthResponse', 'Account created.'), ...problems(400, 409) },
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
    response: { 200: ok('AuthResponse', 'Logged in.'), ...problems(400, 401) },
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
        'can take over an account from an unlocked computer.',
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
        204: { description: 'Password changed. The current token stays valid.', type: 'null' },
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
    const accountService = createAccountService({ userRepository });

    const issueToken = (user: UserDto): string =>
        fastify.jwt.sign({ sub: user.id, role: user.role });

    fastify.post<{ Body: RegisterDto }>(
        '/auth/register',
        { schema: registerSchema },
        async (request, reply) => {
            const user = await authService.register(request.body);
            return reply.code(201).send({ token: issueToken(user), user });
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
            return { user: toUserDto(user) };
        },
    );

    fastify.patch<{ Body: UpdateAccountDto }>(
        '/auth/me',
        { preHandler: fastify.authenticate, schema: updateMeSchema },
        async (request) => ({
            user: await accountService.updateAccount(request.user.sub, request.body),
        }),
    );

    fastify.put<{ Body: ChangePasswordDto }>(
        '/auth/me/password',
        { preHandler: fastify.authenticate, schema: passwordSchema },
        async (request, reply) => {
            await accountService.changePassword(request.user.sub, request.body);
            return reply.code(204).send();
        },
    );

    fastify.delete<{ Body: DeleteAccountDto }>(
        '/auth/me',
        { preHandler: fastify.authenticate, schema: deleteMeSchema },
        async (request, reply) => {
            await accountService.deleteAccount(request.user.sub, request.body.currentPassword);
            return reply.code(204).send();
        },
    );
}
