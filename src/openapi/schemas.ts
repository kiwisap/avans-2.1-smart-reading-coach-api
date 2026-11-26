import { nullableRef } from './helpers.js';
import { USER_ROLES } from '../auth/roles.js';
import {
    DESIRED_LENGTHS,
    LANGUAGE_LEVELS,
    MATERIAL_TYPES,
    MAX_TOPICS,
    READING_GOALS,
} from '../profile/profileOptions.js';
import { ADVICE_SOURCES } from '../advice/sources.js';
import { BADGE_IDS } from '../progress/xp.js';
import { MAX_COMMENT_LENGTH, MAX_RATING, MIN_RATING } from '../readingList/ratings.js';
import { READING_LIST_SOURCES } from '../readingList/sources.js';
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
        $id: 'ReadingListSource',
        type: 'string',
        enum: [...READING_LIST_SOURCES],
        description:
            'Where a title on the reading list came from: the advice page, the catalog or a teacher.',
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
        required: ['id', 'email', 'name', 'firstName', 'infix', 'lastName', 'role', 'pendingEmail'],
        properties: {
            id: uuid('User id.'),
            email: text('Email address.', { format: 'email' }),
            name: text('Display name: first name, infix and last name together.'),
            firstName: text('Voornaam.'),
            infix: nullableText('Tussenvoegsel, for example "van der". Null when there is none.'),
            lastName: text('Achternaam.'),
            role: { $ref: 'Role#' },
            pendingEmail: {
                type: 'string',
                format: 'email',
                nullable: true,
                description:
                    'A new email address that waits for its confirmation link to be clicked.',
            },
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
        $id: 'Registered',
        type: 'object',
        description: 'The account exists, but can only be used after confirming the email address.',
        required: ['email'],
        properties: {
            email: text('The address the confirmation link was sent to.', { format: 'email' }),
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
        required: [...bookRequired, 'motivation', 'reasons'],
        properties: {
            ...bookProperties,
            motivation: text('Why this title fits the reading profile, in one short sentence.'),
            reasons: stringList('All reasons why this title fits, most important first.'),
        },
    },
    {
        $id: 'AdviceSource',
        type: 'string',
        enum: [...ADVICE_SOURCES],
        description:
            'ai: the advice comes from the AI model. rules: the AI service was not available, the ' +
            'rule based scoring was used.',
    },
    {
        $id: 'Advice',
        type: 'object',
        description: 'Reading advice for a student.',
        required: ['source', 'suggestions'],
        properties: {
            source: { $ref: 'AdviceSource#' },
            suggestions: {
                type: 'array',
                description: 'Recommended titles, best match first.',
                items: { $ref: 'Suggestion#' },
            },
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
        required: [
            'id',
            'bookId',
            'status',
            'addedAt',
            'readAt',
            'source',
            'rating',
            'comment',
            'book',
        ],
        properties: {
            id: uuid('Id of the reading list entry.'),
            bookId: text('Catalog id of the book.'),
            status: { $ref: 'ReadingStatus#' },
            addedAt: { type: 'string', format: 'date-time' },
            readAt: { type: 'string', format: 'date-time', nullable: true },
            source: nullableRef(
                'ReadingListSource',
                'Null for titles added before this was tracked.',
            ),
            rating: {
                type: 'integer',
                minimum: MIN_RATING,
                maximum: MAX_RATING,
                nullable: true,
                description: 'Stars the student gave after reading, null when not rated.',
            },
            comment: {
                type: 'string',
                maxLength: MAX_COMMENT_LENGTH,
                nullable: true,
                description: 'What the student thought of it, in their own words.',
            },
            book: nullableRef('Book', 'The book, or null when it was removed from the catalog.'),
        },
    },
    {
        $id: 'LinkedTeacher',
        type: 'object',
        required: ['id', 'name', 'email'],
        properties: {
            id: uuid('Teacher id.'),
            name: text('Teacher name.'),
            email: text('Teacher email address.', { format: 'email' }),
        },
    },
    {
        $id: 'StudentLink',
        type: 'object',
        required: ['id', 'name', 'email', 'linked'],
        properties: {
            id: uuid('Student id.'),
            name: text('Student name.'),
            email: text('Student email address.', { format: 'email' }),
            linked: { type: 'boolean', description: 'Whether this teacher follows the student.' },
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
        required: ['student', 'profile', 'readingList', 'progress'],
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
            progress: { $ref: 'Progress#' },
        },
    },
    {
        $id: 'Badge',
        type: 'object',
        required: ['id', 'xp', 'earnedAt'],
        properties: {
            id: { type: 'string', enum: [...BADGE_IDS], description: 'Badge id.' },
            xp: { type: 'integer', description: 'XP needed for the badge.' },
            earnedAt: {
                type: 'string',
                format: 'date-time',
                nullable: true,
                description: 'When the badge was earned, null while it is not earned yet.',
            },
        },
    },
    {
        $id: 'Progress',
        type: 'object',
        description: 'XP and badges of a student.',
        required: ['xp', 'badges', 'nextBadge', 'rewards'],
        properties: {
            xp: { type: 'integer', description: 'Total XP.' },
            badges: { type: 'array', items: { $ref: 'Badge#' }, description: 'Low to high.' },
            nextBadge: {
                type: 'object',
                nullable: true,
                required: ['id', 'xp'],
                description: 'The next badge to earn, null when every badge is earned.',
                properties: {
                    id: { type: 'string', enum: [...BADGE_IDS] },
                    xp: { type: 'integer' },
                },
            },
            rewards: {
                type: 'object',
                description: 'XP per action.',
                required: ['profile', 'added', 'addedFromAdvice', 'read', 'rated'],
                properties: {
                    profile: { type: 'integer' },
                    added: { type: 'integer' },
                    addedFromAdvice: { type: 'integer' },
                    read: { type: 'integer' },
                    rated: { type: 'integer' },
                },
            },
        },
    },
    {
        $id: 'SourceCount',
        type: 'object',
        required: ['total', 'read', 'rated', 'averageRating'],
        properties: {
            total: { type: 'integer', description: 'Titles on the reading lists.' },
            read: { type: 'integer', description: 'Of which read.' },
            rated: { type: 'integer', description: 'Ratings given.' },
            averageRating: { type: 'number', nullable: true, description: 'Average stars.' },
        },
    },
    {
        $id: 'AdviceSourceStats',
        type: 'object',
        required: ['shown', 'added', 'read', 'rated', 'averageRating'],
        properties: {
            shown: { type: 'integer', description: 'Titles Bo showed.' },
            added: { type: 'integer', description: 'Of which added from the advice page.' },
            read: { type: 'integer', description: 'Of which read.' },
            rated: { type: 'integer', description: 'Ratings given.' },
            averageRating: { type: 'number', nullable: true, description: 'Average stars.' },
        },
    },
    {
        $id: 'AdviceStats',
        type: 'object',
        description: 'Whether the advice helps, over the students a teacher follows.',
        required: ['students', 'shown', 'added', 'catalogAlsoSuggested', 'bySource'],
        properties: {
            students: { type: 'integer' },
            shown: { type: 'integer', description: 'Different titles Bo showed.' },
            added: {
                type: 'object',
                required: ['advice', 'catalog', 'teacher', 'unknown'],
                properties: {
                    advice: { $ref: 'SourceCount#' },
                    catalog: { $ref: 'SourceCount#' },
                    teacher: { $ref: 'SourceCount#' },
                    unknown: { $ref: 'SourceCount#' },
                },
            },
            catalogAlsoSuggested: {
                type: 'integer',
                description: 'Added from the catalog, while Bo had shown the title as well.',
            },
            bySource: {
                type: 'object',
                required: ['ai', 'rules'],
                properties: {
                    ai: { $ref: 'AdviceSourceStats#' },
                    rules: { $ref: 'AdviceSourceStats#' },
                },
            },
        },
    },
    {
        $id: 'Health',
        type: 'object',
        required: ['status', 'postgres', 'mongo', 'ai'],
        properties: {
            status: text('ok when the API runs.'),
            postgres: { type: 'boolean', description: 'PostgreSQL answered the ping.' },
            mongo: { type: 'boolean', description: 'MongoDB answered the ping.' },
            ai: {
                type: 'string',
                enum: ['ok', 'unavailable', 'disabled'],
                description:
                    'ok: the AI service answers and has a model. unavailable: it is configured but ' +
                    'does not answer, the advice uses the rules. disabled: AI_SERVICE_URL is not set.',
            },
        },
    },
] as const;
