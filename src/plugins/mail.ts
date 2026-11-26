import fp from 'fastify-plugin';
import { createMailer, type SentMail } from '../mail/mailer.js';

interface MailPluginOptions {
    smtpUrl: string | null;
    from: string;
    appUrl: string;
    devOutbox: boolean;
}

// Makes the mailer available as fastify.mail. Without SMTP_URL mails go to the log.
// With DEV_MAIL_OUTBOX=true (never in production) the last mails can be read on
// GET /api/dev/mails, so the e2e tests can click the links in them.
export default fp<MailPluginOptions>(async (fastify, opts) => {
    const outbox: SentMail[] | null = opts.devOutbox ? [] : null;
    const mailer = createMailer({
        smtpUrl: opts.smtpUrl,
        from: opts.from,
        log: fastify.log,
        outbox,
    });
    fastify.decorate('mail', { mailer, appUrl: opts.appUrl });

    if (!opts.smtpUrl) fastify.log.info('SMTP_URL is not set, mails are written to the log');
    if (!outbox) return;

    fastify.log.warn('DEV_MAIL_OUTBOX is on: sent mails can be read on /api/dev/mails');
    fastify.get<{ Querystring: { to?: string } }>(
        '/api/dev/mails',
        { schema: { hide: true } },
        async (request) => {
            const to = request.query.to?.toLowerCase();
            return { mails: outbox.filter((mail) => !to || mail.to.toLowerCase() === to) };
        },
    );
});
