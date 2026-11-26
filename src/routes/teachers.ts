import type { FastifyInstance } from 'fastify';
import { problems, secured, wrap } from '../openapi/helpers.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createTeacherLinkService } from '../services/teacherLinkService.js';

const listSchema = {
    tags: ['Teachers'],
    summary: 'List the teachers who follow the logged in student',
    description: 'Teachers link themselves to a student, a student cannot change this list.',
    security: secured,
    response: {
        200: wrap('teachers', 'LinkedTeacher', 'Linked teachers.', true),
        ...problems(401, 403),
    },
};

export default async function teacherRoutes(fastify: FastifyInstance): Promise<void> {
    const service = createTeacherLinkService({ userRepository: createUserRepository(fastify.db) });

    // Students only: see which teachers can look at your profile and reading list.
    fastify.get(
        '/teachers',
        { preHandler: fastify.authorize('student'), schema: listSchema },
        async (request) => ({
            teachers: await service.listTeachersOfStudent(request.user.sub),
        }),
    );
}
