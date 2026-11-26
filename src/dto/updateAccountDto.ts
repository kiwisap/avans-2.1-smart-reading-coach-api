// Changes to the own account. Send only what changes. A new email address needs the current password.
export interface UpdateAccountDto {
    firstName?: string;
    infix?: string | null;
    lastName?: string;
    email?: string;
    currentPassword?: string;
}
