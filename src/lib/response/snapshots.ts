/**
 * Immutable product snapshots stored with assistant messages, so old answers
 * and their cards stay consistent when products are edited or deleted.
 * Snapshots are created only on the server from owner-visible products.
 */
import { FIELD_LIMITS } from "../limits";

export const MAX_SNAPSHOTS = 3;

export type ProductSnapshot = {
  productId: string;
  name: string;
  activeSubstance: string;
  category: string;
  useFor: string;
  /** null when dosing was withheld (special-group context). */
  howToUse: string | null;
  tip: string;
  source: "seeded" | "custom";
};

type SnapshotSource = {
  id: string;
  ownerId: string | null;
  name: string;
  activeSubstance: string;
  category: string;
  useFor: string;
  howToUse: string;
  tip: string;
};

/** Builds at most 3 snapshots from owner-visible products. */
export function createSnapshots(
  products: readonly SnapshotSource[],
  ownerId: string | null,
  hideDosing: boolean,
): ProductSnapshot[] {
  return products
    .filter((p) => p.ownerId === null || (ownerId !== null && p.ownerId === ownerId))
    .slice(0, MAX_SNAPSHOTS)
    .map((p) => ({
      productId: p.id,
      name: p.name,
      activeSubstance: p.activeSubstance,
      category: p.category,
      useFor: p.useFor,
      howToUse: hideDosing ? null : p.howToUse,
      tip: p.tip,
      source: p.ownerId === null ? "seeded" : "custom",
    }));
}

const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

export function isProductSnapshot(value: unknown): value is ProductSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    str(s.productId, 64) &&
    str(s.name, FIELD_LIMITS.productName) &&
    str(s.activeSubstance, FIELD_LIMITS.activeSubstance) &&
    str(s.category, FIELD_LIMITS.category) &&
    str(s.useFor, FIELD_LIMITS.useFor) &&
    (s.howToUse === null || str(s.howToUse, FIELD_LIMITS.howToUse)) &&
    str(s.tip, FIELD_LIMITS.tip) &&
    (s.source === "seeded" || s.source === "custom")
  );
}

/**
 * Safely reads snapshots from stored JSON. Malformed data yields an empty
 * list (never throws, never exposes raw JSON); invalid entries are dropped.
 */
export function parseSnapshots(value: unknown): ProductSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isProductSnapshot).slice(0, MAX_SNAPSHOTS);
}
