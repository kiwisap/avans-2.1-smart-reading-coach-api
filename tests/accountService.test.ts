import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type { User } from '../src/entities/user.js';
import { createAccountService } from '../src/services/accountService.js';

const PASSWORD = 'Password123!';
const hash = bcrypt.hashSync(PASSWORD, 4);

function setup() {
    const users: User[] = [
        {
            id: 'u1',
            email: 'sam@example.com',
            name: 'Sam',
            role: 'student',
            passwordHash: hash,
            createdAt: new Date(),
        },
        {
            id: 'u2',
            email: 'taken@example.com',
            name: 'Kim',
            role: 'student',
            passwordHash: hash,
            createdAt: new Date(),
        },
    ];
    const userRepository = {
        findById: async (id: string) => users.find((user) => user.id === id) ?? null,
        findByEmail: async (email: string) => users.find((user) => user.email === email) ?? null,
        updateAccount: async (id: string, changes: { name?: string; email?: string }) => {
            const user = users.find((item) => item.id === id);
            if (!user) throw new Error('not found');
            Object.assign(user, changes);
            return user;
        },
        updatePasswordHash: async (id: string, passwordHash: string) => {
            const user = users.find((item) => item.id === id);
            if (user) user.passwordHash = passwordHash;
        },
    };
    return { service: createAccountService({ userRepository }), users };
}

const statusOf = (err: unknown) => (err as { statusCode?: number }).statusCode;
const codeOf = (err: unknown) => (err as { code?: string }).code;

describe('accountService', () => {
    it('changes the name without asking for the password', async () => {
        const { service } = setup();
        const user = await service.updateAccount('u1', { name: '  Sam de Vries ' });
        assert.equal(user.name, 'Sam de Vries');
    });

    it('changes the email address with the current password, in lowercase', async () => {
        const { service } = setup();
        const user = await service.updateAccount('u1', {
            email: 'Sam.New@Example.com',
            currentPassword: PASSWORD,
        });
        assert.equal(user.email, 'sam.new@example.com');
    });

    it('refuses a new email address without or with a wrong password', async () => {
        const { service, users } = setup();
        await assert.rejects(
            service.updateAccount('u1', { email: 'new@example.com' }),
            (err: unknown) => statusOf(err) === 400 && codeOf(err) === 'account.passwordRequired',
        );
        await assert.rejects(
            service.updateAccount('u1', { email: 'new@example.com', currentPassword: 'wrong' }),
            (err: unknown) => codeOf(err) === 'account.wrongPassword',
        );
        assert.equal(users[0]?.email, 'sam@example.com');
    });

    it('refuses an email address that belongs to someone else', async () => {
        const { service } = setup();
        await assert.rejects(
            service.updateAccount('u1', { email: 'taken@example.com', currentPassword: PASSWORD }),
            (err: unknown) => statusOf(err) === 409,
        );
    });

    it('does not ask for the password when the email address stays the same', async () => {
        const { service } = setup();
        const user = await service.updateAccount('u1', { email: 'SAM@example.com', name: 'Sam' });
        assert.equal(user.email, 'sam@example.com');
    });

    it('changes the password only with the right current password', async () => {
        const { service, users } = setup();
        await assert.rejects(
            service.changePassword('u1', { currentPassword: 'wrong', newPassword: 'Nieuw123!' }),
            (err: unknown) => codeOf(err) === 'account.wrongPassword',
        );
        await service.changePassword('u1', {
            currentPassword: PASSWORD,
            newPassword: 'Nieuw123!',
        });
        assert.ok(await bcrypt.compare('Nieuw123!', users[0]?.passwordHash ?? ''));
    });

    it('refuses a new password that is the same as the current one', async () => {
        const { service } = setup();
        await assert.rejects(
            service.changePassword('u1', { currentPassword: PASSWORD, newPassword: PASSWORD }),
            (err: unknown) => codeOf(err) === 'account.samePassword',
        );
    });

    it('treats a removed account as logged out', async () => {
        const { service } = setup();
        await assert.rejects(
            service.updateAccount('gone', { name: 'X' }),
            (err: unknown) => statusOf(err) === 401,
        );
    });
});
