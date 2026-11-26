import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import { fullName } from '../src/auth/fullName.js';
import type { User } from '../src/entities/user.js';
import type { AccountChanges } from '../src/repositories/userRepository.js';
import { createAccountService } from '../src/services/accountService.js';

const PASSWORD = 'Password123!';
const hash = bcrypt.hashSync(PASSWORD, 4);

const makeUser = (id: string, email: string, firstName: string, lastName: string): User => ({
    id,
    email,
    name: `${firstName} ${lastName}`,
    firstName,
    infix: null,
    lastName,
    role: 'student',
    passwordHash: hash,
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
});

function setup() {
    const users: User[] = [
        makeUser('u1', 'sam@example.com', 'Sam', 'Berg'),
        makeUser('u2', 'taken@example.com', 'Kim', 'Jansen'),
    ];
    const userRepository = {
        findById: async (id: string) => users.find((user) => user.id === id) ?? null,
        findByEmail: async (email: string) => users.find((user) => user.email === email) ?? null,
        updateAccount: async (id: string, changes: AccountChanges) => {
            const user = users.find((item) => item.id === id);
            if (!user) throw new Error('not found');
            Object.assign(user, changes);
            return user;
        },
        updatePasswordHash: async (id: string, passwordHash: string) => {
            const user = users.find((item) => item.id === id);
            if (user) user.passwordHash = passwordHash;
        },
        remove: async (id: string) => {
            const index = users.findIndex((item) => item.id === id);
            if (index === -1) return false;
            users.splice(index, 1);
            return true;
        },
    };
    const mails: string[] = [];
    let pending: string | null = null;
    const accountMailService = {
        requestEmailChange: async (user: User, newEmail: string) => {
            pending = newEmail;
            mails.push(`change:${user.email}->${newEmail}`);
        },
        pendingEmail: async () => pending,
        notifyPasswordChanged: async (user: User) => {
            mails.push(`password:${user.email}`);
        },
        notifyAccountDeleted: async (user: User) => {
            mails.push(`deleted:${user.email}`);
        },
    };
    return {
        service: createAccountService({ userRepository, accountMailService }),
        users,
        mails,
    };
}

const statusOf = (err: unknown) => (err as { statusCode?: number }).statusCode;
const codeOf = (err: unknown) => (err as { code?: string }).code;

describe('fullName', () => {
    it('joins first name, infix and last name and skips an empty infix', () => {
        assert.equal(
            fullName({ firstName: 'Sanne', infix: 'van der', lastName: 'Berg' }),
            'Sanne van der Berg',
        );
        assert.equal(fullName({ firstName: 'Sam', infix: null, lastName: 'Berg' }), 'Sam Berg');
        assert.equal(fullName({ firstName: ' Sam ', infix: '  ', lastName: 'Berg' }), 'Sam Berg');
    });
});

describe('accountService', () => {
    it('changes the name parts without asking for the password and rebuilds the full name', async () => {
        const { service } = setup();
        const user = await service.updateAccount(
            'u1',
            {
                firstName: ' Sanne ',
                infix: 'van der',
                lastName: 'Berg',
            },
            'nl',
        );
        assert.equal(user.firstName, 'Sanne');
        assert.equal(user.infix, 'van der');
        assert.equal(user.name, 'Sanne van der Berg');
    });

    it('removes the infix when it is sent empty', async () => {
        const { service } = setup();
        await service.updateAccount('u1', { infix: 'de' }, 'nl');
        const user = await service.updateAccount('u1', { infix: '' }, 'nl');
        assert.equal(user.infix, null);
        assert.equal(user.name, 'Sam Berg');
    });

    it('mails a link to a new email address and keeps the old one until it is clicked', async () => {
        const { service, mails } = setup();
        const user = await service.updateAccount(
            'u1',
            { email: 'Sam.New@Example.com', currentPassword: PASSWORD },
            'nl',
        );
        assert.equal(user.email, 'sam@example.com');
        assert.equal(user.pendingEmail, 'sam.new@example.com');
        assert.deepEqual(mails, ['change:sam@example.com->sam.new@example.com']);
    });

    it('refuses a new email address without or with a wrong password', async () => {
        const { service, users } = setup();
        await assert.rejects(
            service.updateAccount('u1', { email: 'new@example.com' }, 'nl'),
            (err: unknown) => statusOf(err) === 400 && codeOf(err) === 'account.passwordRequired',
        );
        await assert.rejects(
            service.updateAccount(
                'u1',
                { email: 'new@example.com', currentPassword: 'wrong' },
                'nl',
            ),
            (err: unknown) => codeOf(err) === 'account.wrongPassword',
        );
        assert.equal(users[0]?.email, 'sam@example.com');
    });

    it('refuses an email address that belongs to someone else', async () => {
        const { service } = setup();
        await assert.rejects(
            service.updateAccount(
                'u1',
                { email: 'taken@example.com', currentPassword: PASSWORD },
                'nl',
            ),
            (err: unknown) => statusOf(err) === 409,
        );
    });

    it('does not ask for the password when the email address stays the same', async () => {
        const { service } = setup();
        const user = await service.updateAccount(
            'u1',
            {
                email: 'SAM@example.com',
                firstName: 'Sam',
            },
            'nl',
        );
        assert.equal(user.email, 'sam@example.com');
    });

    it('changes the password only with the right current password, and mails a notice', async () => {
        const { service, users, mails } = setup();
        await assert.rejects(
            service.changePassword(
                'u1',
                { currentPassword: 'wrong', newPassword: 'Nieuw123!' },
                'nl',
            ),
            (err: unknown) => codeOf(err) === 'account.wrongPassword',
        );
        await service.changePassword(
            'u1',
            {
                currentPassword: PASSWORD,
                newPassword: 'Nieuw123!',
            },
            'nl',
        );
        assert.ok(await bcrypt.compare('Nieuw123!', users[0]?.passwordHash ?? ''));
        assert.deepEqual(mails, ['password:sam@example.com']);
    });

    it('refuses a new password that is the same as the current one', async () => {
        const { service } = setup();
        await assert.rejects(
            service.changePassword(
                'u1',
                { currentPassword: PASSWORD, newPassword: PASSWORD },
                'nl',
            ),
            (err: unknown) => codeOf(err) === 'account.samePassword',
        );
    });

    it('deletes the account only with the right password, and says goodbye by mail', async () => {
        const { service, users, mails } = setup();
        await assert.rejects(
            service.deleteAccount('u1', 'wrong', 'nl'),
            (err: unknown) => codeOf(err) === 'account.wrongPassword',
        );
        assert.equal(users.length, 2);
        await service.deleteAccount('u1', PASSWORD, 'nl');
        assert.deepEqual(
            users.map((user) => user.id),
            ['u2'],
        );
        assert.deepEqual(mails, ['deleted:sam@example.com']);
    });

    it('treats a removed account as logged out', async () => {
        const { service } = setup();
        await assert.rejects(
            service.updateAccount('gone', { firstName: 'X' }, 'nl'),
            (err: unknown) => statusOf(err) === 401,
        );
    });
});
