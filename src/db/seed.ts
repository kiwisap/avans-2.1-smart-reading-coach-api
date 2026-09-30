import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { UserRole } from '../auth/roles.js';
import { createUserRepository } from '../repositories/userRepository.js';
import * as schema from './schema.js';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });
const userRepository = createUserRepository(drizzle(pool, { schema }));

async function ensureUser(input: {
    email: string;
    name: string;
    role: UserRole;
    password: string;
}) {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) return existing;
    const passwordHash = await bcrypt.hash(input.password, 10);
    return userRepository.create({
        email: input.email,
        name: input.name,
        role: input.role,
        passwordHash,
    });
}

// Development accounts only. Change these passwords for anything that is not local.
const teacher = await ensureUser({
    email: 'teacher@example.com',
    name: 'Demo Teacher',
    role: 'teacher',
    password: 'Password123!',
});
const student = await ensureUser({
    email: 'student@example.com',
    name: 'Demo Student',
    role: 'student',
    password: 'Password123!',
});
await userRepository.linkStudentToTeacher(teacher.id, student.id);

await pool.end();
console.log('Seeded teacher@example.com and student@example.com (password: Password123!)');
