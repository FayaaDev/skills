import { HarajError } from "./errors.js";
import { executeGraphql, type FetchLike } from "./graphql.js";
import type { HarajConfig, JsonObject, Listing } from "./types.js";

const getPath = (value: unknown, path: string): unknown => path.split(".").reduce<unknown>((current, key) => current !== null && typeof current === "object" && !Array.isArray(current) ? (current as JsonObject)[key] : Array.isArray(current) && /^\d+$/.test(key) ? current[Number(key)] : undefined, value);
const stringOrNull = (value: unknown): string | null => typeof value === "string" ? value : value === null || value === undefined ? null : String(value);
const scalarOrNull = (value: unknown): string | number | null => typeof value === "string" || typeof value === "number" ? value : null;
const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export class GraphqlSource {
  constructor(private readonly config: HarajConfig, private readonly fetcher: FetchLike = fetch) {}

  async search(keyword: string, variables: JsonObject): Promise<Listing[]> {
    const operation = this.config.operations.search;
    const { limit, bodyText, ...filters } = variables;
    const requestedLimit = limit === undefined ? undefined : Number(limit);
    if (requestedLimit !== undefined && (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100)) throw new HarajError("--limit must be an integer from 1 to 100.");
    const data = await executeGraphql(this.config.endpoint, operation.queryName, this.config.headers, operation.document, { ...(operation.variables ?? {}), ...filters, search: keyword, ...(requestedLimit === undefined ? {} : { limit: requestedLimit }) }, this.fetcher);
    const results = getPath(data, operation.resultsPath);
    if (!Array.isArray(results)) throw new HarajError(`GraphQL search result path ${operation.resultsPath} was not an array.`);
    const needle = typeof bodyText === "string" ? normalizeText(bodyText) : undefined;
    const listings = results.map((value) => this.normalize(value)).filter((listing) => needle === undefined || normalizeText(listing.bodyText ?? "").includes(needle));
    return requestedLimit === undefined ? listings : listings.slice(0, requestedLimit);
  }

  async get(id: string): Promise<Listing> {
    const postId = parsePostId(id);
    if (postId === null) throw new HarajError("Post must be a numeric ID or a canonical Haraj URL.");
    const operation = this.config.operations.get;
    const data = await executeGraphql(this.config.endpoint, operation.queryName, this.config.headers, operation.document, { [operation.idVariable]: [postId] }, this.fetcher);
    const result = getPath(data, operation.resultPath);
    if (result === undefined || result === null) throw new HarajError(`Post ${id} was not found at GraphQL result path ${operation.resultPath}.`);
    return this.normalize(result);
  }

  private normalize(value: unknown): Listing {
    const post = value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
    const price = scalarOrNull(getPath(post, "price.inputPrice"));
    const path = stringOrNull(post.URL);
    return {
      id: typeof post.id === "number" && Number.isFinite(post.id) ? post.id : null,
      title: stringOrNull(post.title),
      price,
      priceDisplay: stringOrNull(getPath(post, "price.formattedPrice")),
      currency: price === null ? null : "SAR",
      city: stringOrNull(post.geoCity) ?? stringOrNull(post.city),
      district: stringOrNull(post.geoNeighborhood),
      tags: stringArray(post.tags),
      imageUrls: stringArray(post.imagesList),
      author: stringOrNull(post.authorUsername),
      bodyText: stringOrNull(post.bodyTEXT),
      url: path === null ? null : new URL(path, "https://haraj.com.sa/").href,
      source: "graphql",
      retrievedAt: new Date().toISOString()
    };
  }
}

const normalizeText = (value: string): string => value.replace(/&ndash;/gi, "-").replace(/\s+/g, " ").trim().toLocaleLowerCase("ar-SA");

const parsePostId = (value: string): number | null => {
  const directId = Number(value);
  if (isGraphqlInt(directId)) return directId;
  try {
    const segment = new URL(value).pathname.split("/").find(Boolean);
    const segmentId = Number(segment);
    if (isGraphqlInt(segmentId)) return segmentId;
    const canonicalMatch = segment?.match(/^11(\d+)$/);
    const postId = Number(canonicalMatch?.[1]);
    return isGraphqlInt(postId) ? postId : null;
  } catch {
    return null;
  }
};

const isGraphqlInt = (value: number): boolean => Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
