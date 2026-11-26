import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReadingProfile } from '../src/entities/readingProfile.js';
import type { User } from '../src/entities/user.js';
import { createTeacherLinkService } from '../src/services/teacherLinkService.js';
import { createTeacherService } from '../src/services/teacherService.js';

const makeUser = (id: string, name: string, role: User['role']): User => ({
    id,
    name,
    firstName: name,
    infix: null,
    lastName: '',
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

const profile: ReadingProfile = {
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
    const searches: { query: string; limit: number }[] = [];

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
        findTeachersOfStudent: async (studentId: string) =>
            Object.values(users)
                .filter((user) => user.role === 'teacher' && linkSet.has(`${user.id}:${studentId}`))
                .map((user) => ({ id: user.id, name: user.name, email: user.email })),
        searchStudents: async (teacherId: string, query: string, limit: number) => {
            searches.push({ query, limit });
            return Object.values(users)
                .filter((user) => user.role === 'student' && user.name.includes(query))
                .map((user) => ({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    linked: linkSet.has(`${teacherId}:${user.id}`),
                }));
        },
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

    const adviceRequests: string[] = [];
    const adviceService = {
        getAdvice: async (studentId: string) => {
            adviceRequests.push(studentId);
            return { source: 'rules' as const, suggestions: [] };
        },
    };

    return {
        teacherService: createTeacherService({
            userRepository,
            profileRepository,
            readingListService,
            adviceService,
        }),
        adviceRequests,
        linkService: createTeacherLinkService({ userRepository }),
        added,
        linkSet,
        searches,
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

    it('shows the advice of a linked student', async () => {
        const { teacherService, adviceRequests } = setup();
        const advice = await teacherService.getStudentAdvice('t1', 's1');
        assert.equal(advice.source, 'rules');
        assert.deepEqual(adviceRequests, ['s1']);
    });

    it('does not show the advice of a student who is not linked', async () => {
        const { teacherService, adviceRequests } = setup();
        await assert.rejects(
            teacherService.getStudentAdvice('t2', 's1'),
            (err: unknown) => statusOf(err) === 403,
        );
        assert.equal(adviceRequests.length, 0);
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
    it('lets a teacher link and unlink themselves to a student', async () => {
        const { linkService, linkSet } = setup([]);
        const linked = await linkService.link('t1', 's1');
        assert.equal(linked.linked, true);
        assert.ok(linkSet.has('t1:s1'));
        const unlinked = await linkService.unlink('t1', 's1');
        assert.equal(unlinked.linked, false);
        assert.ok(!linkSet.has('t1:s1'));
    });

    it('rejects linking to someone who is not a student', async () => {
        const { linkService } = setup([]);
        await assert.rejects(linkService.link('t1', 't2'), (err: unknown) => statusOf(err) === 404);
    });

    it('rejects linking to an unknown student', async () => {
        const { linkService } = setup([]);
        await assert.rejects(
            linkService.link('t1', 'nobody'),
            (err: unknown) => statusOf(err) === 404,
        );
    });

    it('shows a student only the teachers who follow them', async () => {
        const { linkService } = setup([['t1', 's1']]);
        const teachers = await linkService.listTeachersOfStudent('s1');
        assert.deepEqual(
            teachers.map((teacher) => teacher.id),
            ['t1'],
        );
    });

    it('searches students with a trimmed query and a limit, and says who is linked', async () => {
        const { linkService, searches } = setup([['t1', 's1']]);
        const results = await linkService.searchStudents('t1', '  Stud  ');
        assert.deepEqual(searches, [{ query: 'Stud', limit: 20 }]);
        assert.deepEqual(
            results.map((student) => [student.id, student.linked]),
            [['s1', true]],
        );
    });

    it('does not search with fewer than two characters', async () => {
        const { linkService, searches } = setup();
        assert.deepEqual(await linkService.searchStudents('t1', ' S '), []);
        assert.equal(searches.length, 0);
    });
});
