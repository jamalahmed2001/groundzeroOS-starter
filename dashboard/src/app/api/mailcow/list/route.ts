import { NextResponse, type NextRequest } from 'next/server';
import { listEmails } from '@/lib/mailcowImap';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const box = (searchParams.get('box') ?? 'inbox') as 'inbox' | 'drafts';
    const limit = Number(searchParams.get('limit') ?? '15');
    if (box !== 'inbox' && box !== 'drafts') return NextResponse.json({ error: 'Invalid box' }, { status: 400 });
    const items = await listEmails(box, Math.max(1, Math.min(50, limit)));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
