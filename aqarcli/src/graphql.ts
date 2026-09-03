import { AqarError } from "./errors.js";
import type { JsonObject } from "./types.js";

export type FetchLike = typeof fetch;

export const executeGraphql = async (
  endpoint: string,
  headers: Record<string, string> | undefined,
  query: string,
  variables: JsonObject,
  fetcher: FetchLike = fetch
): Promise<JsonObject> => {
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ query, variables })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AqarError(`GraphQL request failed: ${message}`);
  }

  const body = await response.text();
  if (!response.ok) throw new AqarError(`GraphQL returned HTTP ${response.status}: ${body}`);

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new AqarError("GraphQL returned invalid JSON.");
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AqarError("GraphQL returned an invalid response body.");
  }
  const result = payload as JsonObject;
  if (Array.isArray(result.errors) && result.errors.length > 0) {
    const messages = result.errors.map((error) => error && typeof error === "object" && "message" in error ? String(error.message) : JSON.stringify(error));
    throw new AqarError(`GraphQL error: ${messages.join("; ")}`);
  }
  if (result.data === null || typeof result.data !== "object" || Array.isArray(result.data)) {
    throw new AqarError("GraphQL response did not contain data.");
  }
  return result.data as JsonObject;
};
