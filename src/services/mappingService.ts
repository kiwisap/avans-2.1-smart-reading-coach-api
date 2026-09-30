import type { WithId } from 'mongodb';
import type { BookDto } from '../dto/bookDto.js';
import type { ProfileDto } from '../dto/profileDto.js';
import type { ReadingListItemDto } from '../dto/readingListItemDto.js';
import type { UserDto } from '../dto/userDto.js';
import type { Book } from '../entities/book.js';
import type { ReadingListItem } from '../entities/readingListItem.js';
import type { ReadingProfile } from '../entities/readingProfile.js';
import type { User } from '../entities/user.js';

// Converts entities (what the databases store) into DTOs (what the API returns).
// Keeping this in one place makes sure internal fields such as the password hash
// or the Mongo _id never leak into a response by accident.

export function toUserDto(user: User): UserDto {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export function toProfileDto(profile: ReadingProfile | null): ProfileDto | null {
    if (!profile) return null;
    return {
        languageLevel: profile.languageLevel,
        materialTypes: profile.materialTypes,
        topics: profile.topics,
        desiredLength: profile.desiredLength,
        readingGoal: profile.readingGoal,
        updatedAt: profile.updatedAt,
    };
}

export function toBookDto(doc: WithId<Book>): BookDto {
    const { _id, key: _key, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = doc;
    return { id: _id.toString(), ...rest };
}

export function toReadingListItemDto(
    item: ReadingListItem,
    book: BookDto | null | undefined,
): ReadingListItemDto {
    return {
        id: item.id,
        bookId: item.bookId,
        status: item.status,
        addedAt: item.addedAt,
        readAt: item.readAt,
        book: book ?? null,
    };
}
