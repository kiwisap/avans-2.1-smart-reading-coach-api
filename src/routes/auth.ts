import type { FastifyInstance } from 'fastify';
import type { LoginDto } from '../dto/loginDto.js';
import type { RegisterDto } from '../dto/registerDto.js';
import type { UserDto } from '../dto/userDto.js';
import { HttpError } from '../errors.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createAuthService } from '../services/authService.js';
import { toUserDto } from '../services/mappingService.js';

const credentials = {
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: { type: 'string', minLength: 8, maxLength: 72 },
};

const registerSchema = {
    body: {
        type: 'object',
        required: ['email', 'password', 'name'],
        additionalProperties: false,
        properties: {
            ...credentials,
            name: { type: 'string', minLength: 1, maxLength: 100 },
        },
    },
};

const loginSchema = {
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

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
    const userRepository = createUserRepository(fastify.db);
    const authService = createAuthService({ userRepository });

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

    fastify.get('/auth/me', { preHandler: fastify.authenticate }, async (request) => {
        const user = await userRepository.findById(request.user.sub);
        if (!user) throw new HttpError(401, 'Dit account bestaat niet meer');
        return { user: toUserDto(user) };
    });
}
