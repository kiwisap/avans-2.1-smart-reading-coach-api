import { nullableRef } from './helpers.js';
import { USER_ROLES } from '../auth/roles.js';
import {
    DESIRED_LENGTHS,
    LANGUAGE_LEVELS,
    MATERIAL_TYPES,
    MAX_TOPICS,
    READING_GOALS,
} from '../profile/profileOptions.js';
import { READING_STATUSES } from '../readingList/statuses.js';

// Shared JSON schemas. Each one has an $id, so routes can point to it with { $ref: 'Name#' }.
// Fastify uses them to validate requests and to serialize responses, and @fastify/swagger turns
// them into components/schemas in the OpenAPI document. One definition, three uses.

const text = (description: string, extra: object = {}) => ({
    type: 'string',
    description,
    ...extra,
});
const nullableText = (description: string) => ({ type: 'string', nullable: true, description });
const uuid = (description: string) => text(description, { format: 'uuid' });
const stringList = (description: string) => ({
    type: 'array',
    description,
    items: { type: 'string' },
});

const bookProperties = {
    id: text('Catalog id (MongoDB ObjectId as 24 hex characters).', {
        pattern: '^[a-f0-9]{24}$',
    }),
    title: text('Title of the book or article.'),
    author: nullableText('Author, when known.'),
    type: { $ref: 'MaterialType#' },
    genre: nullableText('Genre, when known.'),
    format: nullableText('Format of the material, for example paperback or e-book.'),
    description: nullableText('Short description.'),
    themes: stringList('Themes of the book. Used to match the topics in a reading profile.'),
    levels: {
        type: 'array',
        description: 'Language levels this title is suitable for. Empty when unknown.',
        items: { $ref: 'LanguageLevel#' },
    },
    levelLabel: nullableText('Level as written in the source list.'),
    url: nullableText('Link to the title, when there is one.'),
};
const bookRequired = Object.keys(bookProperties);

const profileProperties = {
    languageLevel: { $ref: 'LanguageLevel#' },
    materialTypes: {
        type: 'array',
        description: 'Kinds of material the student likes to read.',
        minItems: 1,
        maxItems: MATERIAL_TYPES.length,
        items: { $ref: 'MaterialType#' },
    },
    topics: {
        type: 'array',
        description: `Topics of interest, at most ${MAX_TOPICS}. Must exist as a theme in the catalog.`,
        minItems: 1,
        maxItems: MAX_TOPICS,
        items: { type: 'string', maxLength: 60 },
    },
    desiredLength: { $ref: 'DesiredLength#' },
    readingGoal: { $ref: 'ReadingGoal#' },
};
const profileRequired = Object.keys(profileProperties);

export const sharedSchemas = [
    {
        $id: 'Role',
        type: 'string',
        enum: [...USER_ROLES],
        description: 'What a user may do: students keep a profile, teachers follow students.',
    },
    {
        $id: 'LanguageLevel',
        type: 'string',
        enum: [...LANGUAGE_LEVELS],
        description: 'Reading level (2F, 3F or 3F+).',
    },
    { $id: 'MaterialType', type: 'string', enum: [...MATERIAL_TYPES] },
    {
        $id: 'DesiredLength',
        type: 'string',
        enum: [...DESIRED_LENGTHS],
        description: 'How long the material may be.',
    },
    { $id: 'ReadingGoal', type: 'string', enum: [...READING_GOALS] },
    {
        $id: 'ReadingStatus',
        type: 'string',
        enum: [...READING_STATUSES],
        description: 'Whether the student has read the title.',
    },
    {
        $id: 'ProblemDetails',
        type: 'object',
        description: 'Error response according to RFC 9457 (application/problem+json).',
        required: ['type', 'title', 'status', 'detail', 'instance'],
        properties: {
            type: text('URI that identifies the kind of problem.'),
            title: text('Short, fixed summary of the problem (the HTTP status text).'),
            status: { type: 'integer', description: 'HTTP status code.' },
            detail: text(
                'Explanation for the user, in the language of the Accept-Language header.',
            ),
            instance: text('Path of the request that caused the problem.'),
        },
    },
    {
        $id: 'User',
        type: 'object',
        required: ['id', 'email', 'name', 'role'],
        properties: {
            id: uuid('User id.'),
            email: text('Email address.', { format: 'email' }),
            name: text('Display name.'),
            role: { $ref: 'Role#' },
        },
    },
    {
        $id: 'AuthResponse',
        type: 'object',
        required: ['token', 'user'],
        properties: {
            token: text('JWT. Send it as Authorization: Bearer <token>.'),
            user: { $ref: 'User#' },
        },
    },
    {
        $id: 'Book',
        type: 'object',
        required: bookRequired,
        properties: bookProperties,
    },
    {
        $id: 'Suggestion',
        type: 'object',
        description: 'A recommended book with the reason why it was recommended.',
        required: [...bookRequired, 'motivation'],
        properties: {
            ...bookProperties,
            motivation: text('Why this title fits the reading profile.'),
        },
    },
    {
        $id: 'BookPage',
        type: 'object',
        required: ['items', 'total', 'page', 'limit'],
        properties: {
            items: { type: 'array', items: { $ref: 'Book#' } },
            total: { type: 'integer', description: 'Number of books that match, all pages.' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
        },
    },
    {
        $id: 'BookFacets',
        type: 'object',
        description: 'Values that can be used to filter the catalog.',
        required: ['types', 'levels', 'themes'],
        properties: {
            types: stringList('Material types in the catalog.'),
            levels: stringList('Language levels in the catalog.'),
            themes: stringList('Themes in the catalog.'),
        },
    },
    {
        $id: 'ProfileInput',
        type: 'object',
        description: 'The answers a student gives in the reading profile.',
        required: profileRequired,
        additionalProperties: false,
        properties: profileProperties,
    },
    {
        $id: 'ReadingProfile',
        type: 'object',
        required: [...profileRequired, 'updatedAt'],
        properties: {
            ...profileProperties,
            updatedAt: { type: 'string', format: 'date-time' },
        },
    },
    {
        $id: 'ProfileOptions',
        type: 'object',
        description: 'The possible answers for the reading profile form.',
        required: [
            'languageLevels',
            'materialTypes',
            'desiredLengths',
            'readingGoals',
            'maxTopics',
            'topics',
        ],
        properties: {
            languageLevels: { type: 'array', items: { $ref: 'LanguageLevel#' } },
            materialTypes: { type: 'array', items: { $ref: 'MaterialType#' } },
            desiredLengths: { type: 'array', items: { $ref: 'DesiredLength#' } },
            readingGoals: { type: 'array', items: { $ref: 'ReadingGoal#' } },
            maxTopics: { type: 'integer', description: 'Maximum number of topics.' },
            topics: stringList('Topics a student can choose from (the catalog themes).'),
        },
    },
    {
        $id: 'ReadingListItem',
        type: 'object',
        required: ['id', 'bookId', 'status', 'addedAt', 'readAt', 'book'],
        properties: {
            id: uuid('Id of the reading list entry.'),
            bookId: text('Catalog id of the book.'),
            status: { $ref: 'ReadingStatus#' },
            addedAt: { type: 'string', format: 'date-time' },
            readAt: { type: 'string', format: 'date-time', nullable: true },
            book: nullableRef('Book', 'The book, or null when it was removed from the catalog.'),
        },
    },
    {
        $id: 'TeacherLink',
        type: 'object',
        required: ['id', 'name', 'linked'],
        properties: {
            id: uuid('Teacher id.'),
            name: text('Teacher name.'),
            linked: { type: 'boolean', description: 'Whether this teacher can see the student.' },
        },
    },
    {
        $id: 'StudentSummary',
        type: 'object',
        required: ['id', 'name', 'email', 'hasProfile'],
        properties: {
            id: uuid('Student id.'),
            name: text('Student name.'),
            email: text('Student email address.', { format: 'email' }),
            hasProfile: { type: 'boolean', description: 'Whether a reading profile was saved.' },
        },
    },
    {
        $id: 'StudentOverview',
        type: 'object',
        required: ['student', 'profile', 'readingList'],
        properties: {
            student: {
                type: 'object',
                required: ['id', 'name', 'email'],
                properties: {
                    id: uuid('Student id.'),
                    name: text('Student name.'),
                    email: text('Student email address.', { format: 'email' }),
                },
            },
            profile: nullableRef('ReadingProfile'),
            readingList: { type: 'array', items: { $ref: 'ReadingListItem#' } },
        },
    },
    {
        $id: 'Health',
        type: 'object',
        required: ['status', 'postgres', 'mongo'],
        properties: {
            status: text('ok when the API runs.'),
            postgres: { type: 'boolean', description: 'PostgreSQL answered the ping.' },
            mongo: { type: 'boolean', description: 'MongoDB answered the ping.' },
        },
    },
] as const;
