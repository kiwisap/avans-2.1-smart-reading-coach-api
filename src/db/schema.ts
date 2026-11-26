import {
    check,
    integer,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
    uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { ADVICE_SOURCES } from '../advice/sources.js';
import { USER_ROLES } from '../auth/roles.js';
import {
    DESIRED_LENGTHS,
    LANGUAGE_LEVELS,
    READING_GOALS,
    type MaterialType,
} from '../profile/profileOptions.js';
import { XP_REASONS } from '../progress/xp.js';
import { READING_LIST_SOURCES } from '../readingList/sources.js';
import { READING_STATUSES } from '../readingList/statuses.js';

export const userRole = pgEnum('user_role', USER_ROLES);
export const languageLevel = pgEnum('language_level', LANGUAGE_LEVELS);
export const desiredLength = pgEnum('desired_length', DESIRED_LENGTHS);
export const readingGoal = pgEnum('reading_goal', READING_GOALS);
export const readingStatus = pgEnum('reading_status', READING_STATUSES);
export const readingListSource = pgEnum('reading_list_source', READING_LIST_SOURCES);
export const adviceSource = pgEnum('advice_source', ADVICE_SOURCES);
export const xpReason = pgEnum('xp_reason', XP_REASONS);

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(), // display name: first name, infix and last name together
    firstName: text('first_name').notNull().default(''),
    infix: text('infix'), // tussenvoegsel, for example "van der"
    lastName: text('last_name').notNull().default(''),
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
        source: readingListSource('source'), // null for titles added before this was tracked
    },
    (table) => [unique('reading_list_user_book').on(table.userId, table.bookId)],
);

// Every title Bo has shown a student, to measure whether the advice helps: how many of the
// shown titles end up on the reading list and get read.
export const adviceSuggestions = pgTable(
    'advice_suggestions',
    {
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        bookId: text('book_id').notNull(),
        source: adviceSource('source').notNull(), // ai or rules, the first time it was shown
        firstShownAt: timestamp('first_shown_at', { withTimezone: true }).notNull().defaultNow(),
        lastShownAt: timestamp('last_shown_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [primaryKey({ columns: [table.userId, table.bookId] })],
);

// What a student thought of a title, asked by Bo after marking it read. Kept when the title
// leaves the reading list, so the ratings keep helping the advice for other students.
export const bookRatings = pgTable(
    'book_ratings',
    {
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        bookId: text('book_id').notNull(),
        rating: integer('rating').notNull(), // 1 to 5 stars
        comment: text('comment'),
        source: readingListSource('source'), // how the title got on the reading list
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.userId, table.bookId] }),
        check('book_ratings_stars', sql`${table.rating} BETWEEN 1 AND 5`),
    ],
);

// XP a student earned. One row per reason and title, so nothing counts twice.
// bookId is empty for reasons without a title (the reading profile).
export const xpEvents = pgTable(
    'xp_events',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        reason: xpReason('reason').notNull(),
        bookId: text('book_id').notNull().default(''),
        xp: integer('xp').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [unique('xp_events_once').on(table.userId, table.reason, table.bookId)],
);

export type ReadingProfileRow = typeof readingProfiles.$inferSelect;
