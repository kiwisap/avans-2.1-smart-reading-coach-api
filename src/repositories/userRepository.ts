import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { readingProfiles, teacherStudents, users } from '../db/schema.js';
import type { User } from '../entities/user.js';
import type { Database } from '../db/types.js';
import { cleanInfix, fullName } from '../auth/fullName.js';
import type { UserRole } from '../auth/roles.js';

// Characters with a meaning in LIKE patterns are searched for literally.
function escapeLike(text: string): string {
    return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export interface NewUser {
    email: string;
    passwordHash: string;
    firstName: string;
    infix?: string | null;
    lastName: string;
    role?: UserRole;
    emailVerifiedAt?: Date | null; // set for accounts that need no confirmation email (seed)
}

export interface AccountChanges {
    email?: string;
    firstName?: string;
    infix?: string | null;
    lastName?: string;
    name?: string;
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

        async create({
            email,
            passwordHash,
            firstName,
            infix = null,
            lastName,
            role = 'student',
            emailVerifiedAt = null,
        }: NewUser): Promise<User> {
            const [user] = await db
                .insert(users)
                .values({
                    email,
                    passwordHash,
                    firstName: firstName.trim(),
                    infix: cleanInfix(infix),
                    lastName: lastName.trim(),
                    name: fullName({ firstName, infix, lastName }),
                    role,
                    emailVerifiedAt,
                })
                .returning();
            if (!user) throw new Error('Could not create user');
            return user;
        },

        async updateAccount(id: string, changes: AccountChanges): Promise<User> {
            const [user] = await db.update(users).set(changes).where(eq(users.id, id)).returning();
            if (!user) throw new Error('Could not update user');
            return user;
        },

        async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
            await db.update(users).set({ passwordHash }).where(eq(users.id, id));
        },

        // The user clicked a link that reached their mailbox: the address is theirs.
        async markEmailVerified(id: string): Promise<User> {
            const [user] = await db
                .update(users)
                .set({ emailVerifiedAt: new Date() })
                .where(eq(users.id, id))
                .returning();
            if (!user) throw new Error('Could not update user');
            return user;
        },

        // A new email address, confirmed with the link sent to it.
        async updateEmail(id: string, email: string): Promise<User> {
            const [user] = await db
                .update(users)
                .set({ email, emailVerifiedAt: new Date() })
                .where(eq(users.id, id))
                .returning();
            if (!user) throw new Error('Could not update user');
            return user;
        },

        // The reading profile, reading list and teacher links are removed with it (ON DELETE CASCADE).
        async remove(id: string): Promise<boolean> {
            const removed = await db
                .delete(users)
                .where(eq(users.id, id))
                .returning({ id: users.id });
            return removed.length > 0;
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

        // The teachers who follow a student.
        async findTeachersOfStudent(studentId: string) {
            return db
                .select({ id: users.id, name: users.name, email: users.email })
                .from(teacherStudents)
                .innerJoin(users, eq(teacherStudents.teacherId, users.id))
                .where(eq(teacherStudents.studentId, studentId))
                .orderBy(users.name);
        },

        // Students whose name or email address contains the query, plus whether this teacher
        // already follows each one.
        async searchStudents(teacherId: string, query: string, limit: number) {
            const pattern = `%${escapeLike(query)}%`;
            return db
                .select({
                    id: users.id,
                    name: users.name,
                    email: users.email,
                    linked: sql<boolean>`${teacherStudents.studentId} IS NOT NULL`.mapWith(Boolean),
                })
                .from(users)
                .leftJoin(
                    teacherStudents,
                    and(
                        eq(teacherStudents.studentId, users.id),
                        eq(teacherStudents.teacherId, teacherId),
                    ),
                )
                .where(
                    and(
                        eq(users.role, 'student'),
                        or(ilike(users.name, pattern), ilike(users.email, pattern)),
                    ),
                )
                .orderBy(users.name)
                .limit(limit);
        },
    };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
