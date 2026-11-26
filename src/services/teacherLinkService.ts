import type { LinkedTeacherDto } from '../dto/linkedTeacherDto.js';
import type { StudentLinkDto } from '../dto/studentLinkDto.js';
import { HttpError } from '../errors.js';
import type { UserRepository } from '../repositories/userRepository.js';

// Teachers link themselves to their students (FR6). A student only sees who follows them.
type LinkDeps = {
    userRepository: Pick<
        UserRepository,
        | 'findById'
        | 'findTeachersOfStudent'
        | 'searchStudents'
        | 'linkStudentToTeacher'
        | 'unlinkStudentFromTeacher'
    >;
};

// A teacher always searches with at least this many characters, so the whole school never
// shows up in one list, and gets at most this many results.
export const STUDENT_SEARCH_MIN_LENGTH = 2;
export const STUDENT_SEARCH_LIMIT = 20;

export function createTeacherLinkService({ userRepository }: LinkDeps) {
    async function requireStudent(studentId: string) {
        const student = await userRepository.findById(studentId);
        if (!student || student.role !== 'student') throw new HttpError(404, 'students.notFound');
        return student;
    }

    return {
        listTeachersOfStudent(studentId: string): Promise<LinkedTeacherDto[]> {
            return userRepository.findTeachersOfStudent(studentId);
        },

        async searchStudents(teacherId: string, search: string): Promise<StudentLinkDto[]> {
            const query = search.trim();
            if (query.length < STUDENT_SEARCH_MIN_LENGTH) return [];
            return userRepository.searchStudents(teacherId, query, STUDENT_SEARCH_LIMIT);
        },

        async link(teacherId: string, studentId: string): Promise<StudentLinkDto> {
            const student = await requireStudent(studentId);
            await userRepository.linkStudentToTeacher(teacherId, student.id);
            return { id: student.id, name: student.name, email: student.email, linked: true };
        },

        async unlink(teacherId: string, studentId: string): Promise<StudentLinkDto> {
            const student = await requireStudent(studentId);
            await userRepository.unlinkStudentFromTeacher(teacherId, student.id);
            return { id: student.id, name: student.name, email: student.email, linked: false };
        },
    };
}

export type TeacherLinkService = ReturnType<typeof createTeacherLinkService>;
