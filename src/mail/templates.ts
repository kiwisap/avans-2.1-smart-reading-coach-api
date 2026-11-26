import { t, type Locale, type MessageKey } from '../i18n.js';
import type { Mail } from './mailer.js';

// The texts are in locales/nl.json under "mail". Every mail is plain text and simple HTML,
// with Bo saying it, a button for the link and the same link written out.

const escapeHtml = (text: string): string =>
    text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

interface Parts {
    to: string;
    subject: string;
    greeting: string;
    lines: string[];
    action?: { label: string; url: string };
    footer?: string;
}

function compose({ to, subject, greeting, lines, action, footer }: Parts): Mail {
    const text = [
        greeting,
        '',
        ...lines.flatMap((line) => [line, '']),
        ...(action ? [`${action.label}: ${action.url}`, ''] : []),
        ...(footer ? [footer, ''] : []),
        'Bo, de leesuil van Smart Reading Coach',
    ].join('\n');

    const paragraphs = lines.map((line) => `<p style="margin:0 0 16px">${escapeHtml(line)}</p>`);
    const button = action
        ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#1f4d3f;color:#ffffff;font-weight:700;text-decoration:none">${escapeHtml(action.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#6b6357">${escapeHtml(t('mail.linkFallback'))}<br><a href="${escapeHtml(action.url)}" style="color:#1f4d3f;word-break:break-all">${escapeHtml(action.url)}</a></p>`
        : '';
    const html = `<!doctype html>
<html lang="nl"><body style="margin:0;background:#faf6ee;font-family:Arial,Helvetica,sans-serif;color:#1f2a24">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<p style="margin:0 0 24px;font-weight:700;color:#1f4d3f;font-size:18px">Smart Reading Coach</p>
<div style="background:#fffdf8;border:1px solid #e4dccb;border-radius:16px;padding:28px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700">${escapeHtml(greeting)}</p>
${paragraphs.join('\n')}
${button}
${footer ? `<p style="margin:16px 0 0;font-size:13px;color:#6b6357">${escapeHtml(footer)}</p>` : ''}
</div>
<p style="margin:20px 0 0;font-size:13px;color:#6b6357">Bo, de leesuil van Smart Reading Coach</p>
</div></body></html>`;

    return { to, subject, text, html };
}

interface Person {
    email: string;
    firstName: string;
}

const hello = (person: Person, locale: Locale) =>
    t('mail.greeting', { name: person.firstName || person.email }, locale);

function simple(
    key: 'verify' | 'changeEmail' | 'emailChanging' | 'passwordChanged' | 'reset' | 'deleted',
    person: Person,
    locale: Locale,
    params: Record<string, string> = {},
    url?: string,
): Mail {
    const k = (part: 'subject' | 'line1' | 'line2' | 'button' | 'footer') =>
        `mail.${key}.${part}` as MessageKey;
    const lines = [t(k('line1'), params, locale), t(k('line2'), params, locale)];
    return compose({
        to: params.to ?? person.email,
        subject: t(k('subject'), params, locale),
        greeting: hello(person, locale),
        lines,
        action: url ? { label: t(k('button'), params, locale), url } : undefined,
        footer: t(k('footer'), params, locale),
    });
}

export const mails = {
    // After registering: confirm the address before the first login.
    verify: (person: Person, url: string, locale: Locale) =>
        simple('verify', person, locale, {}, url),

    // To the new address: click to make it the address of the account.
    changeEmail: (person: Person, newEmail: string, url: string, locale: Locale) =>
        simple('changeEmail', person, locale, { to: newEmail, newEmail }, url),

    // To the old address: a warning, in case someone else is doing this.
    emailChanging: (person: Person, newEmail: string, resetUrl: string, locale: Locale) =>
        simple('emailChanging', person, locale, { newEmail }, resetUrl),

    passwordChanged: (person: Person, resetUrl: string, locale: Locale) =>
        simple('passwordChanged', person, locale, {}, resetUrl),

    reset: (person: Person, url: string, locale: Locale) =>
        simple('reset', person, locale, {}, url),

    deleted: (person: Person, locale: Locale) => simple('deleted', person, locale),
};
