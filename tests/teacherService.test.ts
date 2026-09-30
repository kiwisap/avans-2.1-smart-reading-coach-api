import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReadingProfileRow, User } from '../src/db/schema.js';
import { createTeacherLinkService } from '../src/services/teacherLinkService.js';
import { createTeacherService } from '../src/services/teacherService.js';

const makeUser = (id: string, name: string, role: User['role']): User => ({
    id,
    name,
    role,
    email: `${id}@example.com`,
    passwordHash: 'hash',
    createdAt: new Date(),
});

const users: Record<string, User> = {
    t1: makeUser('t1', 'Teacher', 'teacher'),
    t2: makeUser('t2', 'Other teacher', 'teacher'),
    s1: makeUser('s1', 'Student', 'student'),
};

const profile: ReadingProfileRow = {
    userId: 's1',
    languageLevel: '2F',
    materialTypes: [],
    topics: [],
    desiredLength: 'short',
    readingGoal: 'learn',
    createdAt: new Date(),
    updatedAt: new Date(),
};

function setup(links: [string, string][] = [['t1', 's1']]) {
    const linkSet = new Set(links.map(([teacher, student]) => `${teacher}:${student}`));
    const added: { studentId: string; bookId: string }[] = [];

    const userRepository = {
        findById: async (id: string) => users[id] ?? null,
        isLinked: async (teacherId: string, studentId: string) =>
            linkSet.has(`${teacherId}:${studentId}`),
        findStudentsOfTeacher: async () => [
            { id: 's1', name: 'Student', email: 's1@example.com', hasProfile: false },
        ],
        linkStudentToTeacher: async (teacherId: string, studentId: string) => {
            linkSet.add(`${teacherId}:${studentId}`);
        },
        unlinkStudentFromTeacher: async (teacherId: string, studentId: string) => {
            linkSet.delete(`${teacherId}:${studentId}`);
        },
        findTeachersForStudent: async () => [],
    };
    const profileRepository = { findByUserId: async () => profile };
    const readingListService = {
        list: async () => [
            {
                id: 'i1',
                bookId: 'b1',
                status: 'unread' as const,
                addedAt: new Date(),
                readAt: null,
                book: null,
            },
        ],
        add: async (studentId: string, bookId: string) => {
            added.push({ studentId, bookId });
            return {
                id: 'i2',
                bookId,
                status: 'unread' as const,
                addedAt: new Date(),
                readAt: null,
                book: null,
            };
        },
    };

    return {
        teacherService: createTeacherService({
            userRepository,
            profileRepository,
            readingListService,
        }),
        linkService: createTeacherLinkService({ userRepository }),
        added,
        linkSet,
    };
}

const statusOf = (err: unknown) => (err as { statusCode?: number }).statusCode;

describe('teacherService', () => {
    it('returns profile and reading list of a linked student', async () => {
        const { teacherService } = setup();
        const overview = await teacherService.getStudentOverview('t1', 's1');
        assert.equal(overview.student.name, 'Student');
        assert.equal(overview.profile?.languageLevel, '2F');
        assert.equal(overview.readingList.length, 1);
    });

    it('refuses access to a student who is not linked to this teacher', async () => {
        const { teacherService } = setup();
        await assert.rejects(
            teacherService.getStudentOverview('t2', 's1'),
            (err: unknown) => statusOf(err) === 403,
        );
    });

    it("lets a teacher add a title to a linked student's list", async () => {
        const { teacherService, added } = setup();
        await teacherService.addToStudentReadingList('t1', 's1', 'b1');
        assert.deepEqual(added, [{ studentId: 's1', bookId: 'b1' }]);
    });

    it('does not add titles for a student who is not linked', async () => {
        const { teacherService, added } = setup();
        await assert.rejects(
            teacherService.addToStudentReadingList('t2', 's1', 'b1'),
            (err: unknown) => statusOf(err) === 403,
        );
        assert.equal(added.length, 0);
    });
});

describe('teacherLinkService', () => {
    it('links and unlinks a student to a teacher', async () => {
        const { linkService, linkSet } = setup([]);
        await linkService.link('s1', 't1');
        assert.ok(linkSet.has('t1:s1'));
        await linkService.unlink('s1', 't1');
        assert.ok(!linkSet.has('t1:s1'));
    });

    it('rejects linking to someone who is not a teacher', async () => {
        const { linkService } = setup();
        await assert.rejects(linkService.link('s1', 's1'), (err: unknown) => statusOf(err) === 404);
    });

    it('rejects linking to an unknown teacher', async () => {
        const { linkService } = setup();
        await assert.rejects(
            linkService.link('s1', 'nobody'),
            (err: unknown) => statusOf(err) === 404,
        );
    });
});
