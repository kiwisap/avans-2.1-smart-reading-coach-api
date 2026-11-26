import bcrypt from 'bcryptjs';
import { cleanInfix, fullName } from '../auth/fullName.js';
import type { ChangePasswordDto } from '../dto/changePasswordDto.js';
import type { UpdateAccountDto } from '../dto/updateAccountDto.js';
import type { UserDto } from '../dto/userDto.js';
import { HttpError } from '../errors.js';
import type { AccountChanges, UserRepository } from '../repositories/userRepository.js';
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
}

// The settings of the logged in user: name, email address, password and removing the account.
export function createAccountService({ userRepository }: Deps) {
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
        async updateAccount(userId: string, input: UpdateAccountDto): Promise<UserDto> {
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
                    changes.email = email;
                }
            }

            if (Object.keys(changes).length === 0) return toUserDto(user);
            try {
                return toUserDto(await userRepository.updateAccount(userId, changes));
            } catch (err) {
                if (isUniqueViolation(err)) throw new HttpError(409, 'auth.emailTaken');
                throw err;
            }
        },

        async changePassword(
            userId: string,
            { currentPassword, newPassword }: ChangePasswordDto,
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
        },

        // Removes the account for good. The password is checked, so an open laptop is not enough.
        async deleteAccount(userId: string, currentPassword: string): Promise<void> {
            const user = await findUser(userId);
            await assertPassword(user.passwordHash, currentPassword);
            await userRepository.remove(userId);
        },
    };
}

export type AccountService = ReturnType<typeof createAccountService>;
