#!/usr/bin/env node

// harajcli/src/cli.ts
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// harajcli/src/config.ts
import { readFile } from "node:fs/promises";

// harajcli/src/errors.ts
class HarajError extends Error {
  constructor(message) {
    super(message);
    this.name = "HarajError";
  }
}

// harajcli/src/config.ts
var requiredString = (value, name) => {
  if (typeof value !== "string" || value.length === 0)
    throw new HarajError(`Configuration requires ${name}.`);
  return value;
};
var object = (value, name) => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new HarajError(`Configuration requires ${name} to be an object.`);
  return value;
};
var headers = (value) => {
  if (value === undefined)
    return;
  return Object.fromEntries(Object.entries(object(value, "headers")).map(([name, header]) => [name, requiredString(header, `headers.${name}`)]));
};
var loadConfig = async (path) => {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new HarajError(`Could not read configuration ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const config = object(parsed, "root");
  const operations = object(config.operations, "operations");
  const search = object(operations.search, "operations.search");
  const get = object(operations.get, "operations.get");
  return {
    endpoint: requiredString(config.endpoint, "endpoint"),
    headers: headers(config.headers),
    operations: {
      search: {
        queryName: requiredString(search.queryName, "operations.search.queryName"),
        document: requiredString(search.document, "operations.search.document"),
        variables: search.variables === undefined ? undefined : object(search.variables, "operations.search.variables"),
        resultsPath: requiredString(search.resultsPath, "operations.search.resultsPath")
      },
      get: {
        queryName: requiredString(get.queryName, "operations.get.queryName"),
        document: requiredString(get.document, "operations.get.document"),
        idVariable: requiredString(get.idVariable, "operations.get.idVariable"),
        resultPath: requiredString(get.resultPath, "operations.get.resultPath")
      }
    }
  };
};

// harajcli/src/graphql.ts
var executeGraphql = async (endpoint, queryName, headers2, query, variables, fetcher = fetch) => {
  const url = new URL(endpoint);
  url.searchParams.set("queryName", queryName);
  let response;
  try {
    response = await fetcher(url, { method: "POST", headers: { "content-type": "application/json", trackId: "", ...headers2 }, body: JSON.stringify({ query, variables }) });
  } catch (error) {
    throw new HarajError(`GraphQL request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const body = await response.text();
  if (!response.ok)
    throw new HarajError(`GraphQL returned HTTP ${response.status}: ${body}`);
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new HarajError("GraphQL returned invalid JSON.");
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    throw new HarajError("GraphQL returned an invalid response body.");
  const result = payload;
  if (Array.isArray(result.errors) && result.errors.length > 0)
    throw new HarajError(`GraphQL error: ${result.errors.map((error) => error && typeof error === "object" && ("message" in error) ? String(error.message) : JSON.stringify(error)).join("; ")}`);
  if (result.data === null || typeof result.data !== "object" || Array.isArray(result.data))
    throw new HarajError("GraphQL response did not contain data.");
  return result.data;
};

// harajcli/src/source.ts
var getPath = (value, path) => path.split(".").reduce((current, key) => current !== null && typeof current === "object" && !Array.isArray(current) ? current[key] : Array.isArray(current) && /^\d+$/.test(key) ? current[Number(key)] : undefined, value);
var stringOrNull = (value) => typeof value === "string" ? value : value === null || value === undefined ? null : String(value);
var scalarOrNull = (value) => typeof value === "string" || typeof value === "number" ? value : null;
var stringArray = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];

class GraphqlSource {
  config;
  fetcher;
  constructor(config, fetcher = fetch) {
    this.config = config;
    this.fetcher = fetcher;
  }
  async search(keyword, variables) {
    const operation = this.config.operations.search;
    const { limit, bodyText, ...filters } = variables;
    const requestedLimit = limit === undefined ? undefined : Number(limit);
    if (requestedLimit !== undefined && (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100))
      throw new HarajError("--limit must be an integer from 1 to 100.");
    const data = await executeGraphql(this.config.endpoint, operation.queryName, this.config.headers, operation.document, { ...operation.variables ?? {}, ...filters, search: keyword, ...requestedLimit === undefined ? {} : { limit: requestedLimit } }, this.fetcher);
    const results = getPath(data, operation.resultsPath);
    if (!Array.isArray(results))
      throw new HarajError(`GraphQL search result path ${operation.resultsPath} was not an array.`);
    const needle = typeof bodyText === "string" ? normalizeText(bodyText) : undefined;
    const listings = results.map((value) => this.normalize(value)).filter((listing) => needle === undefined || normalizeText(listing.bodyText ?? "").includes(needle));
    return requestedLimit === undefined ? listings : listings.slice(0, requestedLimit);
  }
  async get(id) {
    const postId = parsePostId(id);
    if (postId === null)
      throw new HarajError("Post must be a numeric ID or a canonical Haraj URL.");
    const operation = this.config.operations.get;
    const data = await executeGraphql(this.config.endpoint, operation.queryName, this.config.headers, operation.document, { [operation.idVariable]: [postId] }, this.fetcher);
    const result = getPath(data, operation.resultPath);
    if (result === undefined || result === null)
      throw new HarajError(`Post ${id} was not found at GraphQL result path ${operation.resultPath}.`);
    return this.normalize(result);
  }
  normalize(value) {
    const post = value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
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
var normalizeText = (value) => value.replace(/&ndash;/gi, "-").replace(/\s+/g, " ").trim().toLocaleLowerCase("ar-SA");
var parsePostId = (value) => {
  const directId = Number(value);
  if (isGraphqlInt(directId))
    return directId;
  try {
    const segment = new URL(value).pathname.split("/").find(Boolean);
    const segmentId = Number(segment);
    if (isGraphqlInt(segmentId))
      return segmentId;
    const canonicalMatch = segment?.match(/^11(\d+)$/);
    const postId = Number(canonicalMatch?.[1]);
    return isGraphqlInt(postId) ? postId : null;
  } catch {
    return null;
  }
};
var isGraphqlInt = (value) => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;

// harajcli/src/cli.ts
var usage = `Usage:
  haraj search [keyword] [--body-text TEXT] [--city CITY] [--tag TAG] [--page NUMBER] [--limit COUNT] [--during-date 1days|3days|1week|1months] [--near @LAT,LON] [--images] [--videos] [--json] [--config PATH] [--variables JSON]
  haraj get <id-or-url> [--json] [--config PATH]

The default backend is Haraj's public GraphQL interface. Search and get use anonymous frontend operations.`;
var bundledConfigPath = fileURLToPath(new URL("../haraj.config.json", import.meta.url));
var table = (listings) => {
  const rows = listings.map((listing) => [listing.id, listing.title, listing.city, listing.district, listing.priceDisplay ?? listing.price].map((value) => value ?? "-"));
  const header = ["ID", "Title", "City", "District", "Price"];
  const widths = header.map((cell, index) => Math.max(cell.length, ...rows.map((row) => String(row[index]).length)));
  const line = (row) => row.map((cell, index) => String(cell).padEnd(widths[index])).join("  ");
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join(`
`);
};
var parseJsonObject = (value) => {
  if (value === undefined)
    return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error;
    return parsed;
  } catch {
    throw new HarajError("--variables must be a JSON object.");
  }
};
var numberOption = (value, name) => {
  if (value === undefined)
    return;
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new HarajError(`${name} must be a number.`);
  return number;
};
var run = async (argv) => {
  const [command, ...rest] = argv;
  if (command === undefined || command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }
  if (command !== "search" && command !== "get")
    throw new HarajError(`Unknown command ${command}.

${usage}`);
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      city: { type: "string" },
      tag: { type: "string" },
      page: { type: "string" },
      limit: { type: "string" },
      "during-date": { type: "string" },
      "body-text": { type: "string" },
      near: { type: "string" },
      images: { type: "boolean" },
      videos: { type: "boolean" },
      variables: { type: "string" },
      json: { type: "boolean" },
      config: { type: "string" }
    },
    allowPositionals: true,
    strict: true
  });
  const source = new GraphqlSource(await loadConfig(values.config ?? bundledConfigPath));
  if (command === "get") {
    if (positionals.length !== 1)
      throw new HarajError("haraj get requires exactly one post ID or URL.");
    const listing = await source.get(positionals[0]);
    console.log(values.json ? JSON.stringify(listing, null, 2) : table([listing]));
    return;
  }
  if (positionals.length > 1 || positionals.length === 0 && values["body-text"] === undefined)
    throw new HarajError("haraj search requires one keyword or --body-text.");
  if (values["during-date"] !== undefined && !["1days", "3days", "1week", "1months"].includes(values["during-date"])) {
    throw new HarajError("--during-date must be 1days, 3days, 1week, or 1months.");
  }
  const variables = {
    ...parseJsonObject(values.variables),
    ...values.city === undefined ? {} : { city: values.city },
    ...values.tag === undefined ? {} : { tag: values.tag },
    ...values.page === undefined ? {} : { page: numberOption(values.page, "--page") },
    ...values.limit === undefined ? {} : { limit: numberOption(values.limit, "--limit") },
    ...values["during-date"] === undefined ? {} : { duringDate: values["during-date"] },
    ...values["body-text"] === undefined ? {} : { bodyText: values["body-text"] },
    ...values.near === undefined ? {} : { near: values.near },
    ...values.images === undefined ? {} : { onlyWithImage: values.images },
    ...values.videos === undefined ? {} : { onlyWithVideo: values.videos }
  };
  const listings = await source.search(positionals[0] ?? values["body-text"], variables);
  console.log(values.json ? JSON.stringify(listings, null, 2) : table(listings));
};

// harajcli/src/bin.ts
run(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
