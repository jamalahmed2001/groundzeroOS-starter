import { NextResponse } from 'next/server';
import { getEmailSummary } from '@/lib/mailcowImap';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const summary = await getEmailSummary();
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
