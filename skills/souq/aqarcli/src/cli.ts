import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
import { AqarError } from "./errors.js";
import { GraphqlSource } from "./source.js";
import type { JsonObject, Listing } from "./types.js";

const usage = `Usage:
  aqar search [--city CITY] [--district DISTRICT] [--purpose sale|rent|booking] [--type TYPE] [--min-price AMOUNT] [--max-price AMOUNT] [--limit COUNT] [--variables JSON] [--json] [--config PATH]
  aqar get <id-or-url> [--json] [--config PATH]

The default backend is Aqar's internal GraphQL interface. City, district, and property type accept names or numeric IDs.`;
const bundledConfigPath = fileURLToPath(new URL("../aqar.config.json", import.meta.url));

const table = (listings: Listing[]): string => {
  const rows = listings.map((listing) => [listing.id, listing.district, listing.price, listing.currency, listing.areaSqm].map((value) => value ?? "-"));
  const header = ["ID", "District", "Price", "Currency", "Area m2"];
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
    throw new AqarError("--variables must be a JSON object.");
  }
};

const numberOption = (value: string | undefined, name: string): number | undefined => {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new AqarError(`${name} must be a number.`);
  return number;
};

export const run = async (argv: string[]): Promise<void> => {
  const [command, ...rest] = argv;
  if (command === undefined || command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }
  if (command !== "search" && command !== "get") throw new AqarError(`Unknown command ${command}.\n\n${usage}`);

  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      city: { type: "string" }, district: { type: "string" }, purpose: { type: "string" }, type: { type: "string" },
      "min-price": { type: "string" }, "max-price": { type: "string" }, limit: { type: "string" }, variables: { type: "string" },
      json: { type: "boolean" }, config: { type: "string" }
    },
    allowPositionals: true,
    strict: true
  });
  const source = new GraphqlSource(await loadConfig(values.config ?? bundledConfigPath));
  if (command === "get") {
    if (positionals.length !== 1) throw new AqarError("aqar get requires exactly one listing ID or URL.");
    const listing = await source.get(positionals[0]);
    console.log(values.json ? JSON.stringify(listing, null, 2) : table([listing]));
    return;
  }
  if (positionals.length > 0) throw new AqarError("aqar search does not accept positional arguments.");
  const variables: JsonObject = {
    ...parseJsonObject(values.variables),
    ...(values.city === undefined ? {} : { city: values.city }),
    ...(values.district === undefined ? {} : { district: values.district }),
    ...(values.purpose === undefined ? {} : { purpose: values.purpose }),
    ...(values.type === undefined ? {} : { propertyType: values.type }),
    ...(values["min-price"] === undefined ? {} : { minPrice: numberOption(values["min-price"], "--min-price") }),
    ...(values["max-price"] === undefined ? {} : { maxPrice: numberOption(values["max-price"], "--max-price") }),
    ...(values.limit === undefined ? {} : { limit: numberOption(values.limit, "--limit") })
  };
  const listings = await source.search(variables);
  console.log(values.json ? JSON.stringify(listings, null, 2) : table(listings));
};
