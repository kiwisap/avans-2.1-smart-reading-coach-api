// Changes to the own account. A new email address needs the current password.
export interface UpdateAccountDto {
    name?: string;
    email?: string;
    currentPassword?: string;
}
