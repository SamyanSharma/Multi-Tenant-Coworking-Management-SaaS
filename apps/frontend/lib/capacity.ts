// Capacity = one seat per desk + the capacity of every room. The space-level
// total is computed server-side with the same formula
// (apps/backend/src/common/capacity.ts); this copy exists only because the
// zone page already holds its zone's desk and room lists.
export function computeCapacity(
  deskCount: number,
  roomCapacities: number[],
): number {
  return deskCount + roomCapacities.reduce((sum, c) => sum + c, 0);
}
