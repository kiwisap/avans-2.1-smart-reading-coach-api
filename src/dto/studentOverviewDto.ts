import type { ProfileDto } from './profileDto.js';
import type { ProgressDto } from './progressDto.js';
import type { ReadingListItemDto } from './readingListItemDto.js';
import type { UserDto } from './userDto.js';

export interface StudentOverviewDto {
    student: Pick<UserDto, 'id' | 'name' | 'email'>;
    profile: ProfileDto | null;
    readingList: ReadingListItemDto[];
    progress: ProgressDto; // XP and badges of the student
}
