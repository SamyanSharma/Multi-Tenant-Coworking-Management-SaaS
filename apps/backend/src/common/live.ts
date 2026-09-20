/**
 * Stage 9 soft delete: Space, Zone, Desk and Room are never hard-deleted;
 * they get a `deletedAt` timestamp. Every read path that should only see
 * live rows spreads this into its `where`.
 *
 * Invariant that keeps this filter cheap: deleting a parent soft-deletes its
 * whole subtree in ONE transaction with the same timestamp, so a live row
 * never has a deleted ancestor. A query therefore only needs `deletedAt: null`
 * on the row it reads, not on every ancestor.
 */
export const LIVE = { deletedAt: null } as const;
