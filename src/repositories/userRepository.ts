import { and, eq, sql } from 'drizzle-orm';
import { readingProfiles, teacherStudents, users } from '../db/schema.js';
import type { User } from '../entities/user.js';
import type { Database } from '../db/types.js';
import type { UserRole } from '../auth/roles.js';

export interface NewUser {
    email: string;
    passwordHash: string;
    name: string;
    role?: UserRole;
}

export function createUserRepository(db: Database) {
    return {
        async findByEmail(email: string): Promise<User | null> {
            const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
            return user ?? null;
        },

        async findById(id: string): Promise<User | null> {
            const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
            return user ?? null;
        },

        async create({ email, passwordHash, name, role = 'student' }: NewUser): Promise<User> {
            const [user] = await db
                .insert(users)
                .values({ email, passwordHash, name, role })
                .returning();
            if (!user) throw new Error('Could not create user');
            return user;
        },

        // Students linked to a teacher, with a flag for whether their reading profile is filled in.
        async findStudentsOfTeacher(teacherId: string) {
            return db
                .select({
                    id: users.id,
                    name: users.name,
                    email: users.email,
                    hasProfile: sql<boolean>`${readingProfiles.userId} IS NOT NULL`.mapWith(
                        Boolean,
                    ),
                })
                .from(teacherStudents)
                .innerJoin(users, eq(teacherStudents.studentId, users.id))
                .leftJoin(readingProfiles, eq(readingProfiles.userId, users.id))
                .where(eq(teacherStudents.teacherId, teacherId));
        },

        async isLinked(teacherId: string, studentId: string): Promise<boolean> {
            const [row] = await db
                .select({ teacherId: teacherStudents.teacherId })
                .from(teacherStudents)
                .where(
                    and(
                        eq(teacherStudents.teacherId, teacherId),
                        eq(teacherStudents.studentId, studentId),
                    ),
                )
                .limit(1);
            return Boolean(row);
        },

        async linkStudentToTeacher(teacherId: string, studentId: string): Promise<void> {
            await db.insert(teacherStudents).values({ teacherId, studentId }).onConflictDoNothing();
        },

        async unlinkStudentFromTeacher(teacherId: string, studentId: string): Promise<void> {
            await db
                .delete(teacherStudents)
                .where(
                    and(
                        eq(teacherStudents.teacherId, teacherId),
                        eq(teacherStudents.studentId, studentId),
                    ),
                );
        },

        // All teachers, plus whether this student is already linked to each one.
        async findTeachersForStudent(studentId: string) {
            return db
                .select({
                    id: users.id,
                    name: users.name,
                    linked: sql<boolean>`${teacherStudents.studentId} IS NOT NULL`.mapWith(Boolean),
                })
                .from(users)
                .leftJoin(
                    teacherStudents,
                    and(
                        eq(teacherStudents.teacherId, users.id),
                        eq(teacherStudents.studentId, studentId),
                    ),
                )
                .where(eq(users.role, 'teacher'))
                .orderBy(users.name);
        },
    };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
