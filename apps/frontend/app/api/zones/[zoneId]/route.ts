import { NextResponse } from 'next/server';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ zoneId: string }> }
) {
  const { zoneId } = await params;

  return NextResponse.json({
    id: zoneId,
    name: 'North Wing',
    desks: [
      { id: 'desk_1', name: 'Desk 1' },
      { id: 'desk_2', name: 'Desk 2' },
    ],
    rooms: [{ id: 'room_1', name: 'Conference A', capacity: 6 }],
  });
}
