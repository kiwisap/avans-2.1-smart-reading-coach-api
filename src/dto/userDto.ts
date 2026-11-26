import type { UserRole } from '../auth/roles.js';

// What the API exposes about a user. The password hash never leaves the server.
export interface UserDto {
    id: string;
    email: string;
    name: string; // display name, for example "Sanne van der Berg"
    firstName: string;
    infix: string | null; // tussenvoegsel
    lastName: string;
    role: UserRole;
    pendingEmail: string | null; // a new address that still waits for the link to be clicked
}
