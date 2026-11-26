// The display name, for example "Sanne van der Berg". Stored in users.name, so lists and sorting
// keep working with one column, and rebuilt from the parts whenever one of them changes.
export interface NameParts {
    firstName: string;
    infix?: string | null;
    lastName: string;
}

export function fullName({ firstName, infix, lastName }: NameParts): string {
    return [firstName, infix, lastName]
        .map((part) => (part ?? '').trim())
        .filter(Boolean)
        .join(' ');
}

// An empty infix is stored as null.
export function cleanInfix(infix: string | null | undefined): string | null {
    const trimmed = (infix ?? '').trim();
    return trimmed === '' ? null : trimmed;
}
