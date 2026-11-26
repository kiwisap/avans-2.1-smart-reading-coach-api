import bcrypt from 'bcryptjs';
import { cleanInfix, fullName } from '../auth/fullName.js';
import type { ChangePasswordDto } from '../dto/changePasswordDto.js';
import type { UpdateAccountDto } from '../dto/updateAccountDto.js';
import type { UserDto } from '../dto/userDto.js';
import { HttpError } from '../errors.js';
import type { AccountChanges, UserRepository } from '../repositories/userRepository.js';
import type { Locale } from '../i18n.js';
import type { AccountMailService } from './accountMailService.js';
import { toUserDto } from './mappingService.js';

const SALT_ROUNDS = 10;
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
    const error = err as { code?: string; cause?: { code?: string } };
    return error.code === UNIQUE_VIOLATION || error.cause?.code === UNIQUE_VIOLATION;
}

interface Deps {
    userRepository: Pick<
        UserRepository,
        'findById' | 'findByEmail' | 'updateAccount' | 'updatePasswordHash' | 'remove'
    >;
    accountMailService: Pick<
        AccountMailService,
        'requestEmailChange' | 'pendingEmail' | 'notifyPasswordChanged' | 'notifyAccountDeleted'
    >;
}

// The settings of the logged in user: name, email address, password and removing the account.
// A new email address and a new password go together with an email, like everywhere else.
export function createAccountService({ userRepository, accountMailService }: Deps) {
    async function findUser(userId: string) {
        const user = await userRepository.findById(userId);
        if (!user) throw new HttpError(401, 'auth.accountGone');
        return user;
    }

    async function assertPassword(passwordHash: string, password: string | undefined) {
        if (!password) throw new HttpError(400, 'account.passwordRequired');
        if (!(await bcrypt.compare(password, passwordHash))) {
            throw new HttpError(400, 'account.wrongPassword');
        }
    }

    return {
        async updateAccount(
            userId: string,
            input: UpdateAccountDto,
            locale: Locale,
        ): Promise<UserDto> {
            const user = await findUser(userId);
            const changes: AccountChanges = {};

            // Name: first name, infix (tussenvoegsel) and last name. Only what is sent changes.
            const firstName = input.firstName?.trim() ?? user.firstName;
            const infix = input.infix !== undefined ? cleanInfix(input.infix) : user.infix;
            const lastName = input.lastName?.trim() ?? user.lastName;
            if (
                firstName !== user.firstName ||
                infix !== user.infix ||
                lastName !== user.lastName
            ) {
                Object.assign(changes, {
                    firstName,
                    infix,
                    lastName,
                    name: fullName({ firstName, infix, lastName }),
                });
            }

            if (input.email !== undefined) {
                const email = input.email.trim().toLowerCase();
                if (email !== user.email) {
                    // Someone at an unlocked computer must not be able to take over the account.
                    await assertPassword(user.passwordHash, input.currentPassword);
                    const owner = await userRepository.findByEmail(email);
                    if (owner && owner.id !== user.id) throw new HttpError(409, 'auth.emailTaken');
                    // The address changes once the link sent to it is clicked.
                    await accountMailService.requestEmailChange(user, email, locale);
                }
            }

            let updated = user;
            if (Object.keys(changes).length > 0) {
                try {
                    updated = await userRepository.updateAccount(userId, changes);
                } catch (err) {
                    if (isUniqueViolation(err)) throw new HttpError(409, 'auth.emailTaken');
                    throw err;
                }
            }
            return toUserDto(updated, await accountMailService.pendingEmail(userId));
        },

        async changePassword(
            userId: string,
            { currentPassword, newPassword }: ChangePasswordDto,
            locale: Locale,
        ): Promise<void> {
            const user = await findUser(userId);
            await assertPassword(user.passwordHash, currentPassword);
            if (await bcrypt.compare(newPassword, user.passwordHash)) {
                throw new HttpError(400, 'account.samePassword');
            }
            await userRepository.updatePasswordHash(
                userId,
                await bcrypt.hash(newPassword, SALT_ROUNDS),
            );
            await accountMailService.notifyPasswordChanged(user, locale);
        },

        // Removes the account for good. The password is checked, so an open laptop is not enough.
        async deleteAccount(
            userId: string,
            currentPassword: string,
            locale: Locale,
        ): Promise<void> {
            const user = await findUser(userId);
            await assertPassword(user.passwordHash, currentPassword);
            await userRepository.remove(userId);
            await accountMailService.notifyAccountDeleted(user, locale);
        },
    };
}

export type AccountService = ReturnType<typeof createAccountService>;
