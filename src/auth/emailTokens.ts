import { createHash, randomBytes } from 'node:crypto';

// One-time links in emails: confirming an email address, a new email address, or a new password.
export const TOKEN_PURPOSES = ['verify_email', 'change_email', 'reset_password'] as const;
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number];

// How long a link works. A password reset is the most sensitive, so it is the shortest.
export const TOKEN_LIFETIME_MS: Record<TokenPurpose, number> = {
    verify_email: 48 * 60 * 60 * 1000,
    change_email: 24 * 60 * 60 * 1000,
    reset_password: 60 * 60 * 1000,
};

// A new link for the same thing can be asked for once a minute, so nobody can flood a mailbox.
export const RESEND_AFTER_MS = 60 * 1000;

// The token goes into the link; only its hash is stored, so a leaked database gives no working links.
export function createEmailToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: hashEmailToken(token) };
}

export function hashEmailToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}
