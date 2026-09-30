/**
 * Capacity = one seat per desk + the capacity of every room.
 * Single home for the formula so every server-computed total agrees.
 * (The zone page has a client-side twin in apps/frontend/lib/capacity.ts
 * because it already holds that zone's lists.)
 */
export function computeCapacity(
  deskCount: number,
  roomCapacitySum: number,
): number {
  return deskCount + roomCapacitySum;
}
