import nodemailer from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';

export interface Mail {
    to: string;
    subject: string;
    text: string;
    html: string;
}

export interface SentMail extends Mail {
    sentAt: string;
}

export interface Mailer {
    // Never throws: a mail that cannot be sent is logged, the user can ask for it again.
    send(mail: Mail): Promise<void>;
}

export interface MailerOptions {
    smtpUrl: string | null; // for example smtps://user:password@smtp-relay.brevo.com:465
    from: string;
    log: Pick<FastifyBaseLogger, 'info' | 'error'>;
    outbox?: SentMail[] | null; // development only: keeps sent mails for the e2e tests
}

const OUTBOX_SIZE = 50;

// Sends mail over SMTP, so any provider works (Brevo, Gmail, Outlook, Mailtrap).
// Without SMTP_URL nothing is sent: the mail, with its link, is written to the log instead.
export function createMailer({ smtpUrl, from, log, outbox = null }: MailerOptions): Mailer {
    const transport = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;

    return {
        async send(mail) {
            if (outbox) {
                outbox.push({ ...mail, sentAt: new Date().toISOString() });
                if (outbox.length > OUTBOX_SIZE) outbox.shift();
            }
            if (!transport) {
                log.info(
                    { to: mail.to, subject: mail.subject, text: mail.text },
                    'SMTP_URL is not set, this mail was not sent',
                );
                return;
            }
            try {
                await transport.sendMail({ from, ...mail });
            } catch (err) {
                log.error({ err, to: mail.to, subject: mail.subject }, 'Could not send mail');
            }
        },
    };
}
