import { NextResponse } from 'next/server';

// In-memory only — resets on server restart, good enough for UI testing.
const existingBookings: { bookableId: string; startTime: string; endTime: string }[] = [];

export async function POST(req: Request) {
  const body = await req.json();
  const { bookableId, startTime, endTime } = body;

  const overlaps = existingBookings.some(
    (b) =>
      b.bookableId === bookableId &&
      new Date(startTime) < new Date(b.endTime) &&
      new Date(endTime) > new Date(b.startTime)
  );

  if (overlaps) {
    return NextResponse.json(
      { message: 'This slot overlaps an existing booking.' },
      { status: 409 }
    );
  }

  existingBookings.push({ bookableId, startTime, endTime });
  return NextResponse.json({ success: true }, { status: 201 });
}
