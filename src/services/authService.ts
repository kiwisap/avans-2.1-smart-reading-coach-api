import bcrypt from 'bcryptjs';
import type { UserRole } from '../auth/roles.js';
import type { User } from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { UserRepository } from '../repositories/userRepository.js';

const SALT_ROUNDS = 10;
const UNIQUE_VIOLATION = '23505';

export interface PublicUser {
    id: string;
    email: string;
    name: string;
    role: UserRole;
}

export interface RegisterInput {
    email: string;
    password: string;
    name: string;
}

export interface LoginInput {
    email: string;
    password: string;
}

export function toPublicUser(user: User): PublicUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
}

function isUniqueViolation(err: unknown): boolean {
    const error = err as { code?: string; cause?: { code?: string } };
    return error.code === UNIQUE_VIOLATION || error.cause?.code === UNIQUE_VIOLATION;
}

export function createAuthService({ userRepository }: { userRepository: UserRepository }) {
    return {
        // Self registration always creates a student. Teachers are created by an admin or the seed script.
        async register({ email, password, name }: RegisterInput): Promise<PublicUser> {
            const normalizedEmail = email.trim().toLowerCase();

            if (await userRepository.findByEmail(normalizedEmail)) {
                throw new HttpError(409, 'An account with this email already exists');
            }

            const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
            try {
                const user = await userRepository.create({
                    email: normalizedEmail,
                    passwordHash,
                    name: name.trim(),
                    role: 'student',
                });
                return toPublicUser(user);
            } catch (err) {
                if (isUniqueViolation(err)) {
                    throw new HttpError(409, 'An account with this email already exists');
                }
                throw err;
            }
        },

        async login({ email, password }: LoginInput): Promise<PublicUser> {
            const user = await userRepository.findByEmail(email.trim().toLowerCase());
            const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;

            // Same message for unknown email and wrong password, so accounts cannot be probed.
            if (!user || !valid) {
                throw new HttpError(401, 'Invalid email or password');
            }
            return toPublicUser(user);
        },
    };
}
