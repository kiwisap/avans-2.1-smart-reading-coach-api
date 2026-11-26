import bcrypt from 'bcryptjs';
import {
    RESEND_AFTER_MS,
    TOKEN_LIFETIME_MS,
    createEmailToken,
    hashEmailToken,
    type TokenPurpose,
} from '../auth/emailTokens.js';
import type { User } from '../entities/user.js';
import { HttpError } from '../errors.js';
import type { Locale } from '../i18n.js';
import type { Mailer } from '../mail/mailer.js';
import { mails } from '../mail/templates.js';
import type { EmailTokenRepository } from '../repositories/emailTokenRepository.js';
import type { UserRepository } from '../repositories/userRepository.js';

const SALT_ROUNDS = 10;

interface Deps {
    userRepository: Pick<
        UserRepository,
        'findByEmail' | 'findById' | 'markEmailVerified' | 'updateEmail' | 'updatePasswordHash'
    >;
    emailTokenRepository: Pick<
        EmailTokenRepository,
        'replace' | 'consume' | 'lastSentAt' | 'pendingEmail' | 'revoke'
    >;
    mailer: Mailer;
    appUrl: string; // address of the website, the links in the mails point there
    now?: () => Date;
}

// Everything that goes by email: confirming an account, a new email address, a forgotten
// password, and the notices that keep an account safe (password changed, account removed).
export function createAccountMailService({
    userRepository,
    emailTokenRepository,
    mailer,
    appUrl,
    now = () => new Date(),
}: Deps) {
    const link = (path: string, token?: string) =>
        `${appUrl.replace(/\/+$/, '')}${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`;

    async function issue(user: User, purpose: TokenPurpose, newEmail?: string): Promise<string> {
        const { token, hash } = createEmailToken();
        await emailTokenRepository.replace({
            userId: user.id,
            purpose,
            tokenHash: hash,
            newEmail: newEmail ?? null,
            expiresAt: new Date(now().getTime() + TOKEN_LIFETIME_MS[purpose]),
        });
        return token;
    }

    // Repeated requests within a minute send nothing, so nobody can flood a mailbox.
    async function recentlySent(userId: string, purpose: TokenPurpose): Promise<boolean> {
        const last = await emailTokenRepository.lastSentAt(userId, purpose);
        return last !== null && now().getTime() - last.getTime() < RESEND_AFTER_MS;
    }

    async function consume(token: string, purpose: TokenPurpose) {
        const used = await emailTokenRepository.consume(hashEmailToken(token), purpose);
        if (!used) throw new HttpError(400, 'auth.invalidLink');
        return used;
    }

    async function sendVerification(user: User, locale: Locale): Promise<void> {
        const token = await issue(user, 'verify_email');
        await mailer.send(mails.verify(user, link('/verify-email', token), locale));
    }

    async function notifyPasswordChanged(user: User, locale: Locale): Promise<void> {
        await mailer.send(mails.passwordChanged(user, link('/forgot-password'), locale));
    }

    return {
        sendVerification,
        notifyPasswordChanged,

        // Always resolves the same way, so nobody can find out which addresses have an account.
        async resendVerification(email: string, locale: Locale): Promise<void> {
            const user = await userRepository.findByEmail(email.trim().toLowerCase());
            if (!user || user.emailVerifiedAt) return;
            if (await recentlySent(user.id, 'verify_email')) return;
            await sendVerification(user, locale);
        },

        // The link from the confirmation mail. Returns the user, who is then logged in.
        async verifyEmail(token: string): Promise<User> {
            const used = await consume(token, 'verify_email');
            return userRepository.markEmailVerified(used.userId);
        },

        // Same answer whether the address exists or not.
        async requestPasswordReset(email: string, locale: Locale): Promise<void> {
            const user = await userRepository.findByEmail(email.trim().toLowerCase());
            if (!user || (await recentlySent(user.id, 'reset_password'))) return;
            const token = await issue(user, 'reset_password');
            await mailer.send(mails.reset(user, link('/reset-password', token), locale));
        },

        async resetPassword(token: string, newPassword: string, locale: Locale): Promise<void> {
            const used = await consume(token, 'reset_password');
            const user = await userRepository.findById(used.userId);
            if (!user) throw new HttpError(400, 'auth.invalidLink');
            await userRepository.updatePasswordHash(
                user.id,
                await bcrypt.hash(newPassword, SALT_ROUNDS),
            );
            // The link reached their mailbox, so the address is theirs as well.
            if (!user.emailVerifiedAt) await userRepository.markEmailVerified(user.id);
            await emailTokenRepository.revoke(user.id, 'reset_password');
            await notifyPasswordChanged(user, locale);
        },

        // A new address only counts once the link sent to it is clicked. The old address gets a
        // warning, in case someone else is doing this.
        async requestEmailChange(user: User, newEmail: string, locale: Locale): Promise<void> {
            const token = await issue(user, 'change_email', newEmail);
            await mailer.send(
                mails.changeEmail(user, newEmail, link('/confirm-email', token), locale),
            );
            await mailer.send(
                mails.emailChanging(user, newEmail, link('/forgot-password'), locale),
            );
        },

        async confirmEmailChange(token: string): Promise<User> {
            const used = await consume(token, 'change_email');
            if (!used.newEmail) throw new HttpError(400, 'auth.invalidLink');
            const owner = await userRepository.findByEmail(used.newEmail);
            if (owner && owner.id !== used.userId) throw new HttpError(409, 'auth.emailTaken');
            return userRepository.updateEmail(used.userId, used.newEmail);
        },

        pendingEmail(userId: string): Promise<string | null> {
            return emailTokenRepository.pendingEmail(userId);
        },

        async notifyAccountDeleted(user: User, locale: Locale): Promise<void> {
            await mailer.send(mails.deleted(user, locale));
        },
    };
}

export type AccountMailService = ReturnType<typeof createAccountMailService>;
