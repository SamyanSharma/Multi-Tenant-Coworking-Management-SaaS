import { NextResponse } from 'next/server';

const MOCK_SPACES = [
  { id: 'space_1', name: 'Downtown Hub', slug: 'downtown-hub' },
  { id: 'space_2', name: 'Riverside Coworking', slug: 'riverside' },
];

export async function GET() {
  return NextResponse.json(MOCK_SPACES);
}
