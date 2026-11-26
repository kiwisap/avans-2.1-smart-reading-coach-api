import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import { hashEmailToken, type TokenPurpose } from '../src/auth/emailTokens.js';
import type { EmailToken } from '../src/entities/emailToken.js';
import type { User } from '../src/entities/user.js';
import type { Mail } from '../src/mail/mailer.js';
import type { NewEmailToken } from '../src/repositories/emailTokenRepository.js';
import { createAccountMailService } from '../src/services/accountMailService.js';
import { createAuthService } from '../src/services/authService.js';

const PASSWORD = 'Password123!';
const APP = 'https://app.example.org';

function makeUser(overrides: Partial<User> = {}): User {
    return {
        id: 'u1',
        email: 'sam@example.com',
        name: 'Sam Berg',
        firstName: 'Sam',
        infix: null,
        lastName: 'Berg',
        role: 'student',
        passwordHash: bcrypt.hashSync(PASSWORD, 4),
        emailVerifiedAt: null,
        createdAt: new Date(),
        ...overrides,
    };
}

function setup(initial: User[] = [makeUser()]) {
    const users = [...initial];
    let clock = new Date('2026-11-26T12:00:00.000Z');
    const tokens: EmailToken[] = [];
    const sent: Mail[] = [];

    const userRepository = {
        findByEmail: async (email: string) => users.find((user) => user.email === email) ?? null,
        findById: async (id: string) => users.find((user) => user.id === id) ?? null,
        markEmailVerified: async (id: string) => {
            const user = users.find((item) => item.id === id);
            if (!user) throw new Error('not found');
            user.emailVerifiedAt = clock;
            return user;
        },
        updateEmail: async (id: string, email: string) => {
            const user = users.find((item) => item.id === id);
            if (!user) throw new Error('not found');
            Object.assign(user, { email, emailVerifiedAt: clock });
            return user;
        },
        updatePasswordHash: async (id: string, passwordHash: string) => {
            const user = users.find((item) => item.id === id);
            if (user) user.passwordHash = passwordHash;
        },
    };
    const open = (token: EmailToken) => token.usedAt === null && token.expiresAt > clock;
    const emailTokenRepository = {
        replace: async (token: NewEmailToken) => {
            for (let i = tokens.length - 1; i >= 0; i -= 1) {
                const old = tokens[i];
                if (
                    old &&
                    old.userId === token.userId &&
                    old.purpose === token.purpose &&
                    !old.usedAt
                ) {
                    tokens.splice(i, 1);
                }
            }
            tokens.push({
                id: `t${tokens.length + 1}`,
                usedAt: null,
                createdAt: clock,
                ...token,
                newEmail: token.newEmail ?? null,
            });
        },
        consume: async (hash: string, purpose: TokenPurpose) => {
            const token = tokens.find((t) => t.tokenHash === hash && t.purpose === purpose);
            if (!token || !open(token)) return null;
            token.usedAt = clock;
            return token;
        },
        lastSentAt: async (userId: string, purpose: TokenPurpose) =>
            tokens.filter((t) => t.userId === userId && t.purpose === purpose).at(-1)?.createdAt ??
            null,
        pendingEmail: async (userId: string) =>
            tokens.find((t) => t.userId === userId && t.purpose === 'change_email' && open(t))
                ?.newEmail ?? null,
        revoke: async (userId: string, purpose: TokenPurpose) => {
            for (const token of tokens) {
                if (token.userId === userId && token.purpose === purpose && !token.usedAt) {
                    token.usedAt = clock;
                }
            }
        },
    };
    const mailer = {
        send: async (mail: Mail) => {
            sent.push(mail);
        },
    };
    const service = createAccountMailService({
        userRepository,
        emailTokenRepository,
        mailer,
        appUrl: `${APP}/`,
        now: () => clock,
    });
    const later = (ms: number) => {
        clock = new Date(clock.getTime() + ms);
    };
    // The token in the last link that was mailed to this address.
    const tokenFor = (to: string, path: string): string => {
        const mail = sent.filter((item) => item.to === to).at(-1);
        const match = mail?.text.match(new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`));
        if (!match?.[1]) throw new Error(`no ${path} link for ${to}`);
        return match[1];
    };
    return { service, users, tokens, sent, later, tokenFor };
}

const codeOf = (err: unknown) => (err as { code?: string }).code;

describe('confirming an account', () => {
    it('mails a link to the website and only stores the hash of the token', async () => {
        const { service, users, sent, tokens, tokenFor } = setup();
        await service.sendVerification(users[0] as User, 'nl');
        assert.equal(sent.length, 1);
        assert.match(sent[0]?.subject ?? '', /Bevestig je e-mailadres/);
        assert.match(sent[0]?.html ?? '', /Hoi Sam/);
        const token = tokenFor('sam@example.com', `${APP}/verify-email`);
        assert.equal(tokens[0]?.tokenHash, hashEmailToken(token));
        assert.ok(!JSON.stringify(tokens).includes(token));
    });

    it('confirms the address once with the link', async () => {
        const { service, users, tokenFor } = setup();
        await service.sendVerification(users[0] as User, 'nl');
        const token = tokenFor('sam@example.com', '/verify-email');
        const user = await service.verifyEmail(token);
        assert.ok(user.emailVerifiedAt);
        await assert.rejects(
            service.verifyEmail(token),
            (err) => codeOf(err) === 'auth.invalidLink',
        );
    });

    it('refuses an expired link', async () => {
        const { service, users, later, tokenFor } = setup();
        await service.sendVerification(users[0] as User, 'nl');
        later(49 * 60 * 60 * 1000);
        await assert.rejects(
            service.verifyEmail(tokenFor('sam@example.com', '/verify-email')),
            (err) => codeOf(err) === 'auth.invalidLink',
        );
    });

    it('only the newest link works', async () => {
        const { service, users, later, tokenFor } = setup();
        await service.sendVerification(users[0] as User, 'nl');
        const first = tokenFor('sam@example.com', '/verify-email');
        later(2 * 60 * 1000);
        await service.resendVerification('SAM@example.com', 'nl');
        await assert.rejects(
            service.verifyEmail(first),
            (err) => codeOf(err) === 'auth.invalidLink',
        );
        await service.verifyEmail(tokenFor('sam@example.com', '/verify-email'));
    });

    it('resends at most once a minute, and never to unknown or confirmed addresses', async () => {
        const { service, users, sent, later } = setup([
            makeUser(),
            makeUser({ id: 'u2', email: 'done@example.com', emailVerifiedAt: new Date() }),
        ]);
        await service.sendVerification(users[0] as User, 'nl');
        await service.resendVerification('sam@example.com', 'nl');
        assert.equal(sent.length, 1);
        later(61 * 1000);
        await service.resendVerification('sam@example.com', 'nl');
        await service.resendVerification('nobody@example.com', 'nl');
        await service.resendVerification('done@example.com', 'nl');
        assert.equal(sent.length, 2);
    });
});

describe('logging in', () => {
    const authFor = (users: User[]) =>
        createAuthService({
            userRepository: {
                findByEmail: async (email: string) => users.find((u) => u.email === email) ?? null,
            } as never,
        });

    it('needs a confirmed email address, but only says so after the right password', async () => {
        const users = [makeUser()];
        await assert.rejects(
            authFor(users).login({ email: 'sam@example.com', password: 'wrong-password' }),
            (err) => codeOf(err) === 'auth.invalidCredentials',
        );
        await assert.rejects(
            authFor(users).login({ email: 'sam@example.com', password: PASSWORD }),
            (err) => codeOf(err) === 'auth.emailNotVerified',
        );
        (users[0] as User).emailVerifiedAt = new Date();
        const user = await authFor(users).login({ email: 'Sam@Example.com', password: PASSWORD });
        assert.equal(user.email, 'sam@example.com');
    });
});

describe('a forgotten password', () => {
    it('mails a reset link, sets the new password, confirms the address and sends a notice', async () => {
        const { service, users, sent, tokenFor } = setup();
        await service.requestPasswordReset(' Sam@Example.com ', 'nl');
        const token = tokenFor('sam@example.com', '/reset-password');
        await service.resetPassword(token, 'Nieuw-Wachtwoord1', 'nl');
        const user = users[0] as User;
        assert.ok(await bcrypt.compare('Nieuw-Wachtwoord1', user.passwordHash));
        assert.ok(user.emailVerifiedAt);
        assert.match(sent.at(-1)?.subject ?? '', /wachtwoord is gewijzigd/);
        await assert.rejects(
            service.resetPassword(token, 'Ander-Wachtwoord2', 'nl'),
            (err) => codeOf(err) === 'auth.invalidLink',
        );
    });

    it('says nothing about unknown addresses and stops working after an hour', async () => {
        const { service, sent, later, tokenFor } = setup();
        await service.requestPasswordReset('nobody@example.com', 'nl');
        assert.equal(sent.length, 0);
        await service.requestPasswordReset('sam@example.com', 'nl');
        later(61 * 60 * 1000);
        await assert.rejects(
            service.resetPassword(
                tokenFor('sam@example.com', '/reset-password'),
                'X-12345678',
                'nl',
            ),
            (err) => codeOf(err) === 'auth.invalidLink',
        );
    });
});

describe('a new email address', () => {
    it('mails a link to the new address and a warning to the old one', async () => {
        const { service, users, sent } = setup([makeUser({ emailVerifiedAt: new Date() })]);
        await service.requestEmailChange(users[0] as User, 'new@example.com', 'nl');
        assert.deepEqual(
            sent.map((mail) => mail.to),
            ['new@example.com', 'sam@example.com'],
        );
        assert.match(sent[1]?.text ?? '', /new@example\.com/);
        assert.equal(await service.pendingEmail('u1'), 'new@example.com');
    });

    it('changes the address with the link, and only if nobody took it in the meantime', async () => {
        const { service, users, tokenFor } = setup([
            makeUser({ emailVerifiedAt: new Date() }),
            makeUser({ id: 'u2', email: 'other@example.com' }),
        ]);
        await service.requestEmailChange(users[0] as User, 'new@example.com', 'nl');
        const user = await service.confirmEmailChange(
            tokenFor('new@example.com', '/confirm-email'),
        );
        assert.equal(user.email, 'new@example.com');
        assert.equal(await service.pendingEmail('u1'), null);

        await service.requestEmailChange(user, 'other@example.com', 'nl');
        await assert.rejects(
            service.confirmEmailChange(tokenFor('other@example.com', '/confirm-email')),
            (err) => codeOf(err) === 'auth.emailTaken',
        );
    });
});
