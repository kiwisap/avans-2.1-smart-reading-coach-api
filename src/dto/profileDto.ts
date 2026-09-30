import type { ProfileData } from '../profile/profileOptions.js';

export interface ProfileDto extends ProfileData {
    updatedAt: Date;
}
