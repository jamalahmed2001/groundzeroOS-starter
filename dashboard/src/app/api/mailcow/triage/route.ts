import { NextResponse, type NextRequest } from 'next/server';
import { listEmailsEnvelope, type EmailItem } from '@/lib/mailcowImap';
import { readConfig } from '@/lib/config';
import { getVaultRoot, getAllProjects } from '@/lib/vault';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export type TriagedEmail = EmailItem & {
  priority: 'urgent' | 'action' | 'fyi' | 'noise';
  project: string | null;
  actionLabel: string;
  summary: string;
};

function getProjectIds(vaultRoot: string): string[] {
  try {
    return getAllProjects(vaultRoot).map(p => p.id);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit') ?? '30')));

    const emails = await listEmailsEnvelope('inbox', limit);
    if (emails.length === 0) return NextResponse.json({ items: [] });

    const cfg = readConfig();
    const apiKey = cfg.llm?.api_key ?? process.env['OPENROUTER_API_KEY'];
    const model = cfg.llm?.model ?? 'anthropic/claude-haiku-4-5-20251001';
    const baseUrl = cfg.llm?.base_url ?? 'https://openrouter.ai/api/v1';

    // Without LLM, return emails with default priority
    if (!apiKey) {
      const items: TriagedEmail[] = emails.map(e => ({
        ...e,
        priority: e.seen ? 'fyi' : 'action',
        project: null,
        actionLabel: e.seen ? 'Read' : 'Unread',
        summary: e.snippet ?? e.subject,
      }));
      return NextResponse.json({ items });
    }

    const vaultRoot = getVaultRoot();
    const projectIds = getProjectIds(vaultRoot);

    // Build batch prompt
    const emailList = emails.map((e, i) =>
      `[${i}] ID:${e.id}\nFrom: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\nSeen: ${e.seen}\nSnippet: ${e.snippet ?? '(none)'}`
    ).join('\n\n');

    const systemPrompt = `You are an email triage AI. Classify each email and return a JSON array.

Known projects: ${projectIds.length > 0 ? projectIds.join(', ') : '(none)'}

For each email return an object with:
- index: number (same as input [N])
- priority: "urgent" | "action" | "fyi" | "noise"
  - urgent = time-sensitive, requires immediate response (deadlines, incidents, payments)
  - action = needs a response or decision but not critical (questions, reviews, approvals)
  - fyi = informational only, no reply needed (updates, receipts, notifications)
  - noise = newsletters, marketing, automated, low value
- project: string | null  (match to one of the known projects, or null)
- actionLabel: string  (max 4 words, what needs doing. e.g. "Reply needed", "Review PR", "Approve request", "Read only", "Unsubscribe")
- summary: string  (1 sentence, plain english, what the email is about)

Return ONLY a valid JSON array. No markdown, no code fences, no explanation.`;

    const userPrompt = `Triage these ${emails.length} emails:\n\n${emailList}`;

    let triaged: Array<{ index: number; priority: TriagedEmail['priority']; project: string | null; actionLabel: string; summary: string }> = [];

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json() as { choices: Array<{ message: { content: string } }> };
        const raw = data.choices[0]?.message?.content ?? '[]';
        // Handle both array response and {items:[...]} / {emails:[...]} wrapper
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) triaged = parsed;
        else if (Array.isArray(parsed.items)) triaged = parsed.items;
        else if (Array.isArray(parsed.emails)) triaged = parsed.emails;
        else {
          // Try to find first array value
          const firstArr = Object.values(parsed).find(v => Array.isArray(v));
          if (firstArr) triaged = firstArr as typeof triaged;
        }
      }
    } catch {
      // LLM failed — fall back to heuristics below
    }

    // Merge LLM results with emails, falling back to heuristics
    const items: TriagedEmail[] = emails.map((e, i) => {
      const t = triaged.find(x => x.index === i);
      if (t) {
        return { ...e, priority: t.priority, project: t.project, actionLabel: t.actionLabel, summary: t.summary };
      }
      // Heuristic fallback
      const priority: TriagedEmail['priority'] = e.seen ? 'fyi' : 'action';
      return { ...e, priority, project: null, actionLabel: e.seen ? 'Read' : 'Unread', summary: e.snippet ?? e.subject };
    });

    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
