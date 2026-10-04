import { HarajError } from "./errors.js";
import type { JsonObject } from "./types.js";

export type FetchLike = typeof fetch;

export const executeGraphql = async (endpoint: string, queryName: string, headers: Record<string, string> | undefined, query: string, variables: JsonObject, fetcher: FetchLike = fetch): Promise<JsonObject> => {
  const url = new URL(endpoint);
  url.searchParams.set("queryName", queryName);
  let response: Response;
  try {
    response = await fetcher(url, { method: "POST", headers: { "content-type": "application/json", trackId: "", ...headers }, body: JSON.stringify({ query, variables }) });
  } catch (error) {
    throw new HarajError(`GraphQL request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const body = await response.text();
  if (!response.ok) throw new HarajError(`GraphQL returned HTTP ${response.status}: ${body}`);
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new HarajError("GraphQL returned invalid JSON.");
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) throw new HarajError("GraphQL returned an invalid response body.");
  const result = payload as JsonObject;
  if (Array.isArray(result.errors) && result.errors.length > 0) throw new HarajError(`GraphQL error: ${result.errors.map((error) => error && typeof error === "object" && "message" in error ? String(error.message) : JSON.stringify(error)).join("; ")}`);
  if (result.data === null || typeof result.data !== "object" || Array.isArray(result.data)) throw new HarajError("GraphQL response did not contain data.");
  return result.data as JsonObject;
};
