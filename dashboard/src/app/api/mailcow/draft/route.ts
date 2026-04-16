import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface DraftRequest {
  subject: string;
  from: string;
  body: string;       // plain text of original email
  project?: string | null;
  context?: string;   // optional extra context from user
}

export async function POST(req: Request) {
  try {
    const { subject, from, body, project, context } = await req.json() as DraftRequest;
    if (!subject || !from || !body) {
      return NextResponse.json({ error: 'Missing subject, from, or body' }, { status: 400 });
    }

    const cfg = readConfig();
    const apiKey = cfg.llm?.api_key ?? process.env['OPENROUTER_API_KEY'];
    const model = cfg.llm?.model ?? 'anthropic/claude-sonnet-4-6';
    const baseUrl = cfg.llm?.base_url ?? 'https://openrouter.ai/api/v1';

    if (!apiKey) {
      return NextResponse.json({ error: 'No LLM API key configured. Set OPENROUTER_API_KEY in .env.local' }, { status: 400 });
    }

    const systemPrompt = `You are drafting a professional email reply on behalf of Jamal (jamal@fanvue.com).

Style: clear, direct, professional but human. No fluff. No "I hope this email finds you well". Get to the point.

If the email is technical, match the technical depth. If it's business, be concise and decisive.
If it requires more information before replying, draft a polite request for that information.

Return ONLY the email body text (no subject line, no headers). Sign off as "Jamal".`;

    const userPrompt = `Draft a reply to this email.

From: ${from}
Subject: ${subject}
${project ? `Related project: ${project}` : ''}
${context ? `My notes/intent: ${context}` : ''}

Original email:
---
${body.slice(0, 3000)}
---

Write the reply body only.`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `LLM error: ${err.slice(0, 200)}` }, { status: 500 });
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const draft = data.choices[0]?.message?.content ?? '';

    return NextResponse.json({ draft: draft.trim() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
