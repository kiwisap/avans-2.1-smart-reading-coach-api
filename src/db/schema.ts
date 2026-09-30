import { pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { USER_ROLES } from '../auth/roles.js';
import {
    DESIRED_LENGTHS,
    LANGUAGE_LEVELS,
    READING_GOALS,
    type MaterialType,
} from '../profile/profileOptions.js';
import { READING_STATUSES } from '../readingList/statuses.js';

export const userRole = pgEnum('user_role', USER_ROLES);
export const languageLevel = pgEnum('language_level', LANGUAGE_LEVELS);
export const desiredLength = pgEnum('desired_length', DESIRED_LENGTHS);
export const readingGoal = pgEnum('reading_goal', READING_GOALS);
export const readingStatus = pgEnum('reading_status', READING_STATUSES);

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    role: userRole('role').notNull().default('student'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Which students a teacher may look into (used by the teacher dashboard).
export const teacherStudents = pgTable(
    'teacher_students',
    {
        teacherId: uuid('teacher_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        studentId: uuid('student_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
    },
    (table) => [primaryKey({ columns: [table.teacherId, table.studentId] })],
);

// One reading profile per student (FR1, FR2).
export const readingProfiles = pgTable('reading_profiles', {
    userId: uuid('user_id')
        .primaryKey()
        .references(() => users.id, { onDelete: 'cascade' }),
    languageLevel: languageLevel('language_level').notNull(),
    materialTypes: text('material_types').array().notNull().$type<MaterialType[]>(),
    topics: text('topics').array().notNull(),
    desiredLength: desiredLength('desired_length').notNull(),
    readingGoal: readingGoal('reading_goal').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Personal reading list (FR5). book_id points to a document in the MongoDB catalog,
// so it cannot be a foreign key: the service checks that the book exists.
export const readingListItems = pgTable(
    'reading_list_items',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        bookId: text('book_id').notNull(),
        status: readingStatus('status').notNull().default('unread'),
        addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
        readAt: timestamp('read_at', { withTimezone: true }),
    },
    (table) => [unique('reading_list_user_book').on(table.userId, table.bookId)],
);

export type ReadingProfileRow = typeof readingProfiles.$inferSelect;
