import type { Listing, ListingMapping } from "./types.js";

export const getPath = (value: unknown, path: string): unknown => path.split(".").reduce<unknown>((current, key) => (
  current !== null && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[key] : undefined
), value);

const stringOrNull = (value: unknown): string | null => typeof value === "string" ? value : value === null || value === undefined ? null : String(value);
const numberOrNull = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const scalarOrNull = (value: unknown): string | number | null => typeof value === "string" || typeof value === "number" ? value : null;
const valueAt = (value: unknown, path: string | undefined): unknown => path === undefined ? undefined : getPath(value, path);

export const normalizeListing = (value: unknown, mapping: ListingMapping, retrievedAt = new Date().toISOString()): Listing => ({
  id: scalarOrNull(valueAt(value, mapping.id)),
  title: stringOrNull(valueAt(value, mapping.title)),
  price: scalarOrNull(valueAt(value, mapping.price)),
  currency: stringOrNull(valueAt(value, mapping.currency)),
  city: stringOrNull(valueAt(value, mapping.city)),
  district: stringOrNull(valueAt(value, mapping.district)),
  propertyType: stringOrNull(valueAt(value, mapping.propertyType)),
  areaSqm: numberOrNull(valueAt(value, mapping.areaSqm)),
  url: stringOrNull(valueAt(value, mapping.url)),
  source: "graphql",
  retrievedAt
});
