import type { FastifyInstance } from 'fastify';
import { createUserRepository } from '../repositories/userRepository.js';
import { createTeacherLinkService } from '../services/teacherLinkService.js';

const teacherParams = {
    type: 'object',
    required: ['teacherId'],
    properties: { teacherId: { type: 'string', format: 'uuid' } },
};

export default async function teacherRoutes(fastify: FastifyInstance): Promise<void> {
    const service = createTeacherLinkService({ userRepository: createUserRepository(fastify.db) });

    // Students only: choose which teachers are linked to you.
    const preHandler = fastify.authorize('student');
    const withParams = { preHandler, schema: { params: teacherParams } };

    fastify.get('/teachers', { preHandler }, async (request) => ({
        teachers: await service.listTeachers(request.user.sub),
    }));

    fastify.put<{ Params: { teacherId: string } }>(
        '/teachers/:teacherId/link',
        withParams,
        async (request) => ({
            teacher: await service.link(request.user.sub, request.params.teacherId),
        }),
    );

    fastify.delete<{ Params: { teacherId: string } }>(
        '/teachers/:teacherId/link',
        withParams,
        async (request) => ({
            teacher: await service.unlink(request.user.sub, request.params.teacherId),
        }),
    );
}
