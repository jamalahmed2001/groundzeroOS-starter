import { NextResponse, type NextRequest } from 'next/server';
import { getEmailBody } from '@/lib/mailcowImap';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const account = searchParams.get('account');
    const mailbox = searchParams.get('mailbox');
    const uid = Number(searchParams.get('uid'));
    if (!account || !mailbox || !uid) {
      return NextResponse.json({ error: 'Missing account, mailbox, or uid' }, { status: 400 });
    }
    const body = await getEmailBody(account, mailbox, uid);
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
