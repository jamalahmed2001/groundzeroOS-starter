import 'server-only';

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export type MailcowAccount = {
  label?: string;
  user: string;
  pass: string;
};

export type EmailItem = {
  id: string;
  account: string;
  mailbox: string; // IMAP mailbox name
  uid: number;
  date: string; // ISO
  subject: string;
  from: string;
  to: string;
  seen: boolean;
  snippet?: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function getAccounts(): MailcowAccount[] {
  const raw = process.env.MAILCOW_IMAP_ACCOUNTS;
  if (!raw) {
    // Back-compat for single account envs
    const user = process.env.MAILCOW_IMAP_USER;
    const pass = process.env.MAILCOW_IMAP_PASS;
    if (user && pass) return [{ user, pass, label: user }];
    throw new Error('Missing MAILCOW_IMAP_ACCOUNTS (JSON) or MAILCOW_IMAP_USER/PASS');
  }
  const parsed = JSON.parse(raw) as MailcowAccount[];
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('MAILCOW_IMAP_ACCOUNTS must be a non-empty JSON array');
  return parsed;
}

function imapConfigFor(acct: MailcowAccount) {
  const host = requireEnv('MAILCOW_IMAP_HOST');
  const port = Number(process.env.MAILCOW_IMAP_PORT ?? '993');
  const secure = (process.env.MAILCOW_IMAP_SECURE ?? 'true') !== 'false';
  return {
    host,
    port,
    secure,
    auth: { user: acct.user, pass: acct.pass },
    logger: false,
  } as const;
}


// Fast envelope-only fetch — no body download. Used by triage for speed.
export async function listEmailsEnvelope(kind: 'inbox' | 'drafts', limitPerAccount = 30): Promise<EmailItem[]> {
  const mailbox = kind === 'drafts'
    ? (process.env.MAILCOW_IMAP_DRAFTS_MAILBOX ?? 'Drafts')
    : (process.env.MAILCOW_IMAP_INBOX_MAILBOX ?? 'INBOX');

  const accounts = getAccounts();
  const all: EmailItem[] = [];

  for (const acct of accounts) {
    const client = new ImapFlow(imapConfigFor(acct));
    await client.connect();
    try {
      const lock = await client.getMailboxLock(mailbox);
      try {
        // Use sequence range to fetch only the last N messages (imapflow 1.x has no built-in limit option)
        const total = (client.mailbox as any).exists as number ?? 0;
        if (total === 0) continue;
        const from = Math.max(1, total - limitPerAccount + 1);
        const range = `${from}:*`; // e.g. "171:*" for last 30 of 200

        for await (const msg of client.fetch(range, { uid: true, envelope: true, flags: true, internalDate: true })) {
          if (!msg.uid || !msg.envelope) continue;
          const env = msg.envelope as any;
          const date = (msg.internalDate ?? env.date ?? new Date()).toISOString();
          const subject = env.subject ? String(env.subject) : '';
          const from_ = env.from?.[0] ? `${env.from[0].name ? env.from[0].name + ' ' : ''}<${env.from[0].address}>` : '';
          const to = env.to?.[0] ? `${env.to[0].name ? env.to[0].name + ' ' : ''}<${env.to[0].address}>` : '';
          const seen = Array.isArray(msg.flags) ? msg.flags.includes('\\Seen') : false;
          const accountLabel = acct.label ?? acct.user;
          all.push({ id: `${accountLabel}:${mailbox}:${msg.uid}`, account: accountLabel, mailbox, uid: msg.uid, date, subject, from: from_, to, seen });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  all.sort((a, b) => (a.date < b.date ? 1 : -1));
  return all;
}

export async function listEmails(kind: 'inbox' | 'drafts', limitPerAccount = 15): Promise<EmailItem[]> {
  const mailbox = kind === 'drafts'
    ? (process.env.MAILCOW_IMAP_DRAFTS_MAILBOX ?? 'Drafts')
    : (process.env.MAILCOW_IMAP_INBOX_MAILBOX ?? 'INBOX');

  const accounts = getAccounts();

  // Serialise to avoid hammering the server.
  const all: EmailItem[] = [];
  for (const acct of accounts) {
    const client = new ImapFlow(imapConfigFor(acct));
    await client.connect();
    try {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const total = (client.mailbox as any).exists as number ?? 0;
        if (total === 0) continue;
        const fromSeq = Math.max(1, total - limitPerAccount + 1);
        const range = `${fromSeq}:*`;

        for await (const msg of client.fetch(range, { uid: true, envelope: true, flags: true, internalDate: true })) {
          if (!msg.uid || !msg.envelope) continue;
          const env = msg.envelope as any;
          const date = (msg.internalDate ?? env.date ?? new Date()).toISOString();
          const subject = env.subject ? String(env.subject) : '';
          const from = env.from?.[0] ? `${env.from[0].name ? env.from[0].name + ' ' : ''}<${env.from[0].address}>` : '';
          const to = env.to?.[0] ? `${env.to[0].name ? env.to[0].name + ' ' : ''}<${env.to[0].address}>` : '';
          const seen = Array.isArray(msg.flags) ? msg.flags.includes('\\Seen') : false;

          let snippet: string | undefined = undefined;
          try {
            const source = await client.download(msg.uid, undefined, { uid: true });
            const parsed = await simpleParser(source.content, { skipHtmlToText: true });
            const text = (parsed.text ?? '').trim().replace(/\s+/g, ' ');
            snippet = text ? text.slice(0, 180) : undefined;
          } catch {
            // ignore
          }

          const accountLabel = acct.label ?? acct.user;
          all.push({
            id: `${accountLabel}:${mailbox}:${msg.uid}`,
            account: accountLabel,
            mailbox,
            uid: msg.uid,
            date,
            subject,
            from,
            to,
            seen,
            snippet,
          });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  all.sort((a, b) => (a.date < b.date ? 1 : -1));
  return all;
}

export type EmailBody = {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  text: string;
  html: string | null;
};

export async function getEmailBody(account: string, mailbox: string, uid: number): Promise<EmailBody> {
  const accounts = getAccounts();
  const acct = accounts.find(a => (a.label ?? a.user) === account);
  if (!acct) throw new Error(`Account not found: ${account}`);

  const client = new ImapFlow(imapConfigFor(acct));
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const source = await client.download(uid, undefined, { uid: true });
      const parsed = await simpleParser(source.content);
      const env = parsed;
      return {
        id: `${account}:${mailbox}:${uid}`,
        subject: (env.subject ?? '').toString(),
        from: env.from?.text ?? '',
        to: env.to?.text ?? '',
        date: (env.date ?? new Date()).toISOString(),
        text: (env.text ?? '').trim(),
        html: env.html || null,
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function getEmailSummary(): Promise<{ unread: number; drafts: number }>{
  const accounts = getAccounts();
  const inboxMb = process.env.MAILCOW_IMAP_INBOX_MAILBOX ?? 'INBOX';
  const draftsMb = process.env.MAILCOW_IMAP_DRAFTS_MAILBOX ?? 'Drafts';

  let unread = 0;
  let drafts = 0;

  for (const acct of accounts) {
    const client = new ImapFlow(imapConfigFor(acct));
    await client.connect();
    try {
      // Inbox unread
      {
        const lock = await client.getMailboxLock(inboxMb);
        try {
          const status = client.mailbox;
          // mailbox may not provide unread count reliably; fall back to search
          if (typeof status.unseen === 'number') unread += status.unseen;
          else {
            const unseen = await client.search({ seen: false });
            unread += unseen.length;
          }
        } finally {
          lock.release();
        }
      }

      // Drafts count
      {
        const lock = await client.getMailboxLock(draftsMb);
        try {
          const status = client.mailbox;
          if (typeof status.exists === 'number') drafts += status.exists;
          else {
            const all = await client.search({});
            drafts += all.length;
          }
        } finally {
          lock.release();
        }
      }

    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  return { unread, drafts };
}
