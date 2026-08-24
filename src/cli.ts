import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
import { HarajError } from "./errors.js";
import { GraphqlSource } from "./source.js";
import type { JsonObject, Listing } from "./types.js";

const usage = `Usage:
  haraj search [keyword] [--body-text TEXT] [--city CITY] [--tag TAG] [--page NUMBER] [--limit COUNT] [--during-date 1days|3days|1week|1months] [--near @LAT,LON] [--images] [--videos] [--json] [--config PATH] [--variables JSON]
  haraj get <id-or-url> [--json] [--config PATH]

The default backend is Haraj's public GraphQL interface. Search and get use anonymous frontend operations.`;
const bundledConfigPath = fileURLToPath(new URL("../haraj.config.json", import.meta.url));

const table = (listings: Listing[]): string => {
  const rows = listings.map((listing) => [listing.id, listing.title, listing.city, listing.district, listing.priceDisplay ?? listing.price].map((value) => value ?? "-"));
  const header = ["ID", "Title", "City", "District", "Price"];
  const widths = header.map((cell, index) => Math.max(cell.length, ...rows.map((row) => String(row[index]).length)));
  const line = (row: unknown[]) => row.map((cell, index) => String(cell).padEnd(widths[index])).join("  ");
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join("\n");
};

const parseJsonObject = (value: string | undefined): JsonObject => {
  if (value === undefined) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as JsonObject;
  } catch {
    throw new HarajError("--variables must be a JSON object.");
  }
};

const numberOption = (value: string | undefined, name: string): number | undefined => {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new HarajError(`${name} must be a number.`);
  return number;
};

export const run = async (argv: string[]): Promise<void> => {
  const [command, ...rest] = argv;
  if (command === undefined || command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }
  if (command !== "search" && command !== "get") throw new HarajError(`Unknown command ${command}.\n\n${usage}`);
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      city: { type: "string" }, tag: { type: "string" }, page: { type: "string" }, limit: { type: "string" },
      "during-date": { type: "string" }, "body-text": { type: "string" }, near: { type: "string" }, images: { type: "boolean" }, videos: { type: "boolean" },
      variables: { type: "string" }, json: { type: "boolean" }, config: { type: "string" }
    },
    allowPositionals: true,
    strict: true
  });
  const source = new GraphqlSource(await loadConfig(values.config ?? bundledConfigPath));
  if (command === "get") {
    if (positionals.length !== 1) throw new HarajError("haraj get requires exactly one post ID or URL.");
    const listing = await source.get(positionals[0]);
    console.log(values.json ? JSON.stringify(listing, null, 2) : table([listing]));
    return;
  }
  if (positionals.length > 1 || positionals.length === 0 && values["body-text"] === undefined) throw new HarajError("haraj search requires one keyword or --body-text.");
  if (values["during-date"] !== undefined && !["1days", "3days", "1week", "1months"].includes(values["during-date"])) {
    throw new HarajError("--during-date must be 1days, 3days, 1week, or 1months.");
  }
  const variables: JsonObject = {
    ...parseJsonObject(values.variables),
    ...(values.city === undefined ? {} : { city: values.city }),
    ...(values.tag === undefined ? {} : { tag: values.tag }),
    ...(values.page === undefined ? {} : { page: numberOption(values.page, "--page") }),
    ...(values.limit === undefined ? {} : { limit: numberOption(values.limit, "--limit") }),
    ...(values["during-date"] === undefined ? {} : { duringDate: values["during-date"] }),
    ...(values["body-text"] === undefined ? {} : { bodyText: values["body-text"] }),
    ...(values.near === undefined ? {} : { near: values.near }),
    ...(values.images === undefined ? {} : { onlyWithImage: values.images }),
    ...(values.videos === undefined ? {} : { onlyWithVideo: values.videos })
  };
  const listings = await source.search(positionals[0] ?? values["body-text"]!, variables);
  console.log(values.json ? JSON.stringify(listings, null, 2) : table(listings));
};
