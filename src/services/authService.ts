import bcrypt from 'bcryptjs';
import type { LoginDto } from '../dto/loginDto.js';
import type { RegisterDto } from '../dto/registerDto.js';
import type { UserDto } from '../dto/userDto.js';
import { HttpError } from '../errors.js';
import { toUserDto } from './mappingService.js';
import type { UserRepository } from '../repositories/userRepository.js';

const SALT_ROUNDS = 10;
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
    const error = err as { code?: string; cause?: { code?: string } };
    return error.code === UNIQUE_VIOLATION || error.cause?.code === UNIQUE_VIOLATION;
}

export function createAuthService({ userRepository }: { userRepository: UserRepository }) {
    return {
        // Self registration always creates a student. Teachers are created by an admin or the seed script.
        async register({ email, password, name }: RegisterDto): Promise<UserDto> {
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
                return toUserDto(user);
            } catch (err) {
                if (isUniqueViolation(err)) {
                    throw new HttpError(409, 'An account with this email already exists');
                }
                throw err;
            }
        },

        async login({ email, password }: LoginDto): Promise<UserDto> {
            const user = await userRepository.findByEmail(email.trim().toLowerCase());
            const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;

            // Same message for unknown email and wrong password, so accounts cannot be probed.
            if (!user || !valid) {
                throw new HttpError(401, 'Invalid email or password');
            }
            return toUserDto(user);
        },
    };
}
