import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { emailTokens } from '../db/schema.js';
import type { Database } from '../db/types.js';
import type { EmailToken } from '../entities/emailToken.js';
import type { TokenPurpose } from '../auth/emailTokens.js';

export interface NewEmailToken {
    userId: string;
    purpose: TokenPurpose;
    tokenHash: string;
    expiresAt: Date;
    newEmail?: string | null;
}

export function createEmailTokenRepository(db: Database) {
    return {
        // Only the newest link for something works: older unused ones are removed first.
        async replace(token: NewEmailToken): Promise<void> {
            await db.transaction(async (tx) => {
                await tx
                    .delete(emailTokens)
                    .where(
                        and(
                            eq(emailTokens.userId, token.userId),
                            eq(emailTokens.purpose, token.purpose),
                            isNull(emailTokens.usedAt),
                        ),
                    );
                await tx.insert(emailTokens).values({ ...token, newEmail: token.newEmail ?? null });
            });
        },

        // Uses a link once: marks it used and returns it, in one statement, so a link can never
        // be used twice at the same time. Null when it does not exist, expired or was used.
        async consume(tokenHash: string, purpose: TokenPurpose): Promise<EmailToken | null> {
            const [token] = await db
                .update(emailTokens)
                .set({ usedAt: new Date() })
                .where(
                    and(
                        eq(emailTokens.tokenHash, tokenHash),
                        eq(emailTokens.purpose, purpose),
                        isNull(emailTokens.usedAt),
                        gt(emailTokens.expiresAt, new Date()),
                    ),
                )
                .returning();
            return token ?? null;
        },

        // When the last link for something was sent, to slow down repeated requests.
        async lastSentAt(userId: string, purpose: TokenPurpose): Promise<Date | null> {
            const [token] = await db
                .select({ createdAt: emailTokens.createdAt })
                .from(emailTokens)
                .where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose)))
                .orderBy(desc(emailTokens.createdAt))
                .limit(1);
            return token?.createdAt ?? null;
        },

        // The new email address that still waits for confirmation, if any.
        async pendingEmail(userId: string): Promise<string | null> {
            const [token] = await db
                .select({ newEmail: emailTokens.newEmail })
                .from(emailTokens)
                .where(
                    and(
                        eq(emailTokens.userId, userId),
                        eq(emailTokens.purpose, 'change_email'),
                        isNull(emailTokens.usedAt),
                        gt(emailTokens.expiresAt, new Date()),
                    ),
                )
                .orderBy(desc(emailTokens.createdAt))
                .limit(1);
            return token?.newEmail ?? null;
        },

        // After a password reset every other open reset link stops working.
        async revoke(userId: string, purpose: TokenPurpose): Promise<void> {
            await db
                .delete(emailTokens)
                .where(
                    and(
                        eq(emailTokens.userId, userId),
                        eq(emailTokens.purpose, purpose),
                        isNull(emailTokens.usedAt),
                    ),
                );
        },
    };
}

export type EmailTokenRepository = ReturnType<typeof createEmailTokenRepository>;
