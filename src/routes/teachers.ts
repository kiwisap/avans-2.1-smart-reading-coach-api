import type { FastifyInstance } from 'fastify';
import { problems, secured, wrap } from '../openapi/helpers.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createTeacherLinkService } from '../services/teacherLinkService.js';

const teacherParams = {
    type: 'object',
    required: ['teacherId'],
    properties: { teacherId: { type: 'string', format: 'uuid', description: 'Teacher id.' } },
};

const baseSchema = { tags: ['Teachers'], security: secured, params: teacherParams };

const listSchema = {
    tags: ['Teachers'],
    summary: 'List all teachers and whether they are linked to the student',
    security: secured,
    response: {
        200: wrap('teachers', 'TeacherLink', 'All teachers.', true),
        ...problems(401, 403),
    },
};

const linkSchema = {
    ...baseSchema,
    summary: 'Let a teacher follow the logged in student',
    response: { 200: wrap('teacher', 'TeacherLink', 'Linked.'), ...problems(400, 401, 403, 404) },
};

const unlinkSchema = {
    ...baseSchema,
    summary: 'Stop a teacher from following the logged in student',
    response: { 200: wrap('teacher', 'TeacherLink', 'Unlinked.'), ...problems(400, 401, 403, 404) },
};

export default async function teacherRoutes(fastify: FastifyInstance): Promise<void> {
    const service = createTeacherLinkService({ userRepository: createUserRepository(fastify.db) });

    // Students only: choose which teachers are linked to you.
    const preHandler = fastify.authorize('student');

    fastify.get('/teachers', { preHandler, schema: listSchema }, async (request) => ({
        teachers: await service.listTeachers(request.user.sub),
    }));

    fastify.put<{ Params: { teacherId: string } }>(
        '/teachers/:teacherId/link',
        { preHandler, schema: linkSchema },
        async (request) => ({
            teacher: await service.link(request.user.sub, request.params.teacherId),
        }),
    );

    fastify.delete<{ Params: { teacherId: string } }>(
        '/teachers/:teacherId/link',
        { preHandler, schema: unlinkSchema },
        async (request) => ({
            teacher: await service.unlink(request.user.sub, request.params.teacherId),
        }),
    );
}
