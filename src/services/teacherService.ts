import { HttpError } from '../errors.js';
import type { ReadingListItemDto } from '../dto/readingListItemDto.js';
import type { StudentOverviewDto } from '../dto/studentOverviewDto.js';
import { toProfileDto } from './mappingService.js';
import type { ReadingListService } from './readingListService.js';
import type { ProfileRepository } from '../repositories/profileRepository.js';
import type { UserRepository } from '../repositories/userRepository.js';

interface Deps {
    userRepository: Pick<UserRepository, 'isLinked' | 'findById' | 'findStudentsOfTeacher'>;
    profileRepository: Pick<ProfileRepository, 'findByUserId'>;
    readingListService: Pick<ReadingListService, 'list' | 'add'>;
}

// What a teacher may do with the students linked to them (FR6).
export function createTeacherService({
    userRepository,
    profileRepository,
    readingListService,
}: Deps) {
    // Every student specific action goes through this check, so a teacher only ever sees linked students.
    async function assertLinked(teacherId: string, studentId: string): Promise<void> {
        if (!(await userRepository.isLinked(teacherId, studentId))) {
            throw new HttpError(403, 'This student is not linked to you');
        }
    }

    return {
        listStudents(teacherId: string) {
            return userRepository.findStudentsOfTeacher(teacherId);
        },

        async getStudentOverview(
            teacherId: string,
            studentId: string,
        ): Promise<StudentOverviewDto> {
            await assertLinked(teacherId, studentId);
            const student = await userRepository.findById(studentId);
            if (!student) throw new HttpError(404, 'Student not found');

            const [profile, readingList] = await Promise.all([
                profileRepository.findByUserId(studentId),
                readingListService.list(studentId),
            ]);
            return {
                student: { id: student.id, name: student.name, email: student.email },
                profile: toProfileDto(profile),
                readingList,
            };
        },

        async addToStudentReadingList(
            teacherId: string,
            studentId: string,
            bookId: string,
        ): Promise<ReadingListItemDto> {
            await assertLinked(teacherId, studentId);
            return readingListService.add(studentId, bookId);
        },
    };
}
