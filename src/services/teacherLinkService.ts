import type { TeacherLinkDto } from '../dto/teacherLinkDto.js';
import { HttpError } from '../errors.js';
import type { UserRepository } from '../repositories/userRepository.js';

// A student chooses which teachers may see their profile and reading list (FR6).
type LinkDeps = {
    userRepository: Pick<
        UserRepository,
        'findById' | 'findTeachersForStudent' | 'linkStudentToTeacher' | 'unlinkStudentFromTeacher'
    >;
};

export function createTeacherLinkService({ userRepository }: LinkDeps) {
    async function requireTeacher(teacherId: string) {
        const teacher = await userRepository.findById(teacherId);
        if (!teacher || teacher.role !== 'teacher') throw new HttpError(404, 'Teacher not found');
        return teacher;
    }

    return {
        async listTeachers(studentId: string): Promise<TeacherLinkDto[]> {
            return userRepository.findTeachersForStudent(studentId);
        },

        async link(studentId: string, teacherId: string): Promise<TeacherLinkDto> {
            const teacher = await requireTeacher(teacherId);
            await userRepository.linkStudentToTeacher(teacher.id, studentId);
            return { id: teacher.id, name: teacher.name, linked: true };
        },

        async unlink(studentId: string, teacherId: string): Promise<TeacherLinkDto> {
            const teacher = await requireTeacher(teacherId);
            await userRepository.unlinkStudentFromTeacher(teacher.id, studentId);
            return { id: teacher.id, name: teacher.name, linked: false };
        },
    };
}
