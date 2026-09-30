import type { UserRole } from '../auth/roles.js';

// What the API exposes about a user. The password hash never leaves the server.
export interface UserDto {
    id: string;
    email: string;
    name: string;
    role: UserRole;
}
