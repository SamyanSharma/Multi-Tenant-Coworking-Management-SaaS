import { NextResponse } from 'next/server';

// TEMPORARY MOCK — delete this file (or gate behind NODE_ENV==='development')
// once Teammate A's real POST /rooms endpoint is proxied in.
export async function POST(req: Request) {
  const body = await req.json();
  return NextResponse.json({ id: `room_${Date.now()}`, ...body }, { status: 201 });
}
