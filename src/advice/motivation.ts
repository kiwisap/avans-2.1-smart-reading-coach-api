import type { BookDto } from '../dto/bookDto.js';
import type { DesiredLength, ProfileData, ReadingGoal } from '../profile/profileOptions.js';
import type { MatchReasons } from './scoring.js';

const TYPE_NAMES: Record<string, string> = {
    boek: 'boek',
    'online-artikel': 'online artikel',
    blogpost: 'blogpost',
    dichtbundel: 'dichtbundel',
    tijdschrift: 'tijdschrift',
    krant: 'krant',
};

const LENGTH_TEXT: Record<DesiredLength, string> = {
    short: 'korte',
    medium: 'middellange',
    long: 'lange',
};

const GOAL_TEXT: Record<ReadingGoal, string> = {
    enjoyment: 'Een goede keuze om voor je plezier te lezen.',
    learn: 'Een goede keuze om iets nieuws te leren.',
    language: 'Een goede keuze om je taalvaardigheid te oefenen.',
    work: 'Handig voor werk of studie.',
};

// "Waarom dit bij je past": alleen opgebouwd uit de redenen die echt overeenkomen.
export function buildMotivation(
    profile: ProfileData,
    book: Pick<BookDto, 'type'>,
    reasons: MatchReasons,
): string {
    const parts: string[] = [];

    if (reasons.topics.length > 0)
        parts.push(`Het gaat over je onderwerpen: ${reasons.topics.join(', ')}.`);
    if (reasons.level === 'exact') {
        parts.push(`Het is geschreven op jouw leesniveau (${profile.languageLevel}).`);
    } else if (reasons.level === 'easier') {
        parts.push(
            `Het is iets makkelijker dan jouw niveau (${profile.languageLevel}), dus het leest lekker weg.`,
        );
    }
    if (reasons.materialType) {
        parts.push(
            `Het is een ${TYPE_NAMES[book.type] ?? book.type}, een van de soorten teksten die je leuk vindt.`,
        );
    }
    if (reasons.length)
        parts.push(
            `De lengte past bij je wens voor een ${LENGTH_TEXT[profile.desiredLength]} tekst.`,
        );
    if (reasons.goal) parts.push(GOAL_TEXT[profile.readingGoal]);

    return parts.length > 0 ? parts.join(' ') : 'Een goede keuze op jouw leesniveau.';
}

// Niet elk item in de catalogus heeft een beschrijving (artikelen en poëzie hebben alleen thema's).
export function describeBook(
    book: Pick<BookDto, 'type' | 'author' | 'themes' | 'description'>,
): string {
    if (book.description) return book.description;
    const kind = TYPE_NAMES[book.type] ?? 'tekst';
    const by = book.author ? ` van ${book.author}` : '';
    const about = book.themes?.length ? ` over ${book.themes.join(', ')}` : '';
    return `Een ${kind}${by}${about}.`;
}
