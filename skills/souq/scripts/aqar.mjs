#!/usr/bin/env node

// aqarcli/src/cli.ts
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// aqarcli/src/config.ts
import { readFile } from "node:fs/promises";

// aqarcli/src/errors.ts
class AqarError extends Error {
  constructor(message) {
    super(message);
    this.name = "AqarError";
  }
}

// aqarcli/src/config.ts
var requiredString = (value, name) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new AqarError(`Configuration requires ${name}.`);
  }
  return value;
};
var object = (value, name) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AqarError(`Configuration requires ${name} to be an object.`);
  }
  return value;
};
var expandHeaders = (value) => {
  if (value === undefined)
    return;
  const headers = object(value, "headers");
  return Object.fromEntries(Object.entries(headers).map(([name, header]) => {
    const source = requiredString(header, `headers.${name}`);
    const expanded = source.replace(/\$\{([A-Z0-9_]+)\}/g, (_, variable) => {
      const value2 = process.env[variable];
      if (value2 === undefined)
        throw new AqarError(`Environment variable ${variable} required by headers.${name} is not set.`);
      return value2;
    });
    return [name, expanded];
  }));
};
var loadConfig = async (path) => {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AqarError(`Could not read configuration ${path}: ${message}`);
  }
  const config = object(parsed, "root");
  const operations = object(config.operations, "operations");
  const search = object(operations.search, "operations.search");
  const get = object(operations.get, "operations.get");
  const listing = object(config.listing, "listing");
  const searchVariables = search.variables === undefined ? undefined : object(search.variables, "operations.search.variables");
  return {
    endpoint: requiredString(config.endpoint, "endpoint"),
    headers: expandHeaders(config.headers),
    operations: {
      search: {
        document: requiredString(search.document, "operations.search.document"),
        variables: searchVariables,
        resultsPath: requiredString(search.resultsPath, "operations.search.resultsPath")
      },
      get: {
        document: requiredString(get.document, "operations.get.document"),
        idVariable: requiredString(get.idVariable, "operations.get.idVariable"),
        resultPath: requiredString(get.resultPath, "operations.get.resultPath")
      }
    },
    listing: {
      id: requiredString(listing.id, "listing.id"),
      title: optionalString(listing.title, "listing.title"),
      price: optionalString(listing.price, "listing.price"),
      currency: optionalString(listing.currency, "listing.currency"),
      city: optionalString(listing.city, "listing.city"),
      district: optionalString(listing.district, "listing.district"),
      propertyType: optionalString(listing.propertyType, "listing.propertyType"),
      areaSqm: optionalString(listing.areaSqm, "listing.areaSqm"),
      url: optionalString(listing.url, "listing.url")
    }
  };
};
var optionalString = (value, name) => {
  if (value === undefined)
    return;
  return requiredString(value, name);
};

// aqarcli/src/graphql.ts
var executeGraphql = async (endpoint, headers, query, variables, fetcher = fetch) => {
  let response;
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
  if (!response.ok)
    throw new AqarError(`GraphQL returned HTTP ${response.status}: ${body}`);
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new AqarError("GraphQL returned invalid JSON.");
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AqarError("GraphQL returned an invalid response body.");
  }
  const result = payload;
  if (Array.isArray(result.errors) && result.errors.length > 0) {
    const messages = result.errors.map((error) => error && typeof error === "object" && ("message" in error) ? String(error.message) : JSON.stringify(error));
    throw new AqarError(`GraphQL error: ${messages.join("; ")}`);
  }
  if (result.data === null || typeof result.data !== "object" || Array.isArray(result.data)) {
    throw new AqarError("GraphQL response did not contain data.");
  }
  return result.data;
};

// aqarcli/src/normalize.ts
var getPath = (value, path) => path.split(".").reduce((current, key) => current !== null && typeof current === "object" && !Array.isArray(current) ? current[key] : undefined, value);
var stringOrNull = (value) => typeof value === "string" ? value : value === null || value === undefined ? null : String(value);
var numberOrNull = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
var scalarOrNull = (value) => typeof value === "string" || typeof value === "number" ? value : null;
var valueAt = (value, path) => path === undefined ? undefined : getPath(value, path);
var normalizeListing = (value, mapping, retrievedAt = new Date().toISOString()) => ({
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

// aqarcli/src/source.ts
var CATEGORIES_QUERY = `query AqarCategories {
  Web {
    en: categories(lang: en) { id name plural uri }
    ar: categories(lang: ar) { id name plural uri }
  }
}`;
var CITIES_QUERY = `query AqarCities($category: Int!) {
  Web { cities(category: $category) { city_id name name_en } }
}`;
var DISTRICTS_QUERY = `query AqarDistricts($category: Int!, $cityId: Int!) {
  Web { districts(category: $category, city_id: $cityId) { district_id name name_en } }
}`;

class GraphqlSource {
  config;
  fetcher;
  constructor(config, fetcher = fetch) {
    this.config = config;
    this.fetcher = fetcher;
  }
  async search(variables) {
    const operation = this.config.operations.search;
    const { city, district, purpose, propertyType, minPrice, maxPrice, limit, ...sourceVariables } = variables;
    const where = isObject(sourceVariables.where) ? sourceVariables.where : {};
    const categoryIds = await this.resolveCategories(stringValue(propertyType), stringValue(purpose));
    if (categoryIds.length === 1)
      where.category = { eq: categoryIds[0] };
    if (categoryIds.length > 1)
      where.category = { inar: categoryIds };
    const lookupCategory = categoryIds[0] ?? 0;
    const cityId = city === undefined ? undefined : await this.resolveCity(city, lookupCategory);
    if (cityId !== undefined)
      where.city_id = { eq: cityId };
    if (district !== undefined) {
      if (cityId === undefined)
        throw new AqarError("--district requires --city so Aqar can resolve the district.");
      where.district_id = { eq: await this.resolveDistrict(district, cityId, lookupCategory) };
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {
        ...minPrice === undefined ? {} : { gte: numericValue(minPrice, "minimum price") },
        ...maxPrice === undefined ? {} : { lte: numericValue(maxPrice, "maximum price") }
      };
    }
    const requestedLimit = limit === undefined ? undefined : numericValue(limit, "limit");
    if (requestedLimit !== undefined && requestedLimit < 1)
      throw new AqarError("--limit must be at least 1.");
    const requestVariables = {
      ...operation.variables ?? {},
      ...sourceVariables,
      where,
      ...requestedLimit === undefined ? {} : { size: Math.min(requestedLimit, 100) }
    };
    const data = await executeGraphql(this.config.endpoint, this.config.headers, operation.document, requestVariables, this.fetcher);
    const results = getPath(data, operation.resultsPath);
    if (!Array.isArray(results))
      throw new AqarError(`GraphQL search result path ${operation.resultsPath} was not an array.`);
    return results.map((result) => this.normalize(result));
  }
  async get(id) {
    const operation = this.config.operations.get;
    const match = id.match(/(?:^|[-/])(\d+)(?:[/?#].*)?$/);
    if (match === null)
      throw new AqarError("Listing must be a numeric ID or an Aqar URL ending in a listing ID.");
    const identifier = Number(match[1]);
    const data = await executeGraphql(this.config.endpoint, this.config.headers, operation.document, { [operation.idVariable]: identifier }, this.fetcher);
    const result = getPath(data, operation.resultPath);
    if (result === undefined || result === null)
      throw new AqarError(`Listing ${id} was not found at GraphQL result path ${operation.resultPath}.`);
    return this.normalize(result);
  }
  normalize(value) {
    const listing = normalizeListing(value, this.config.listing);
    if (listing.url !== null && !/^https?:\/\//.test(listing.url)) {
      listing.url = new URL(listing.url, "https://sa.aqar.fm").href;
    }
    if (listing.price !== null && listing.currency === null)
      listing.currency = "SAR";
    return listing;
  }
  async resolveCategories(propertyType, purpose) {
    if (propertyType !== undefined && /^\d+$/.test(propertyType))
      return [Number(propertyType)];
    if (propertyType === undefined && purpose === undefined)
      return [];
    if (purpose !== undefined && purpose !== "sale" && purpose !== "rent" && purpose !== "booking") {
      throw new AqarError("--purpose must be sale, rent, or booking.");
    }
    const data = await executeGraphql(this.config.endpoint, this.config.headers, CATEGORIES_QUERY, {}, this.fetcher);
    const categories = [...arrayAt(data, "Web.en"), ...arrayAt(data, "Web.ar")];
    const typeNeedle = propertyType === undefined ? undefined : normalizeName(propertyType);
    const purposeNeedle = purpose === undefined ? undefined : purpose === "sale" ? "for sale" : purpose === "rent" ? "for rent" : "for booking";
    const matches = categories.filter((category) => {
      if (!isObject(category))
        return false;
      const text = normalizeName([category.name, category.plural, category.uri].filter((part) => typeof part === "string").join(" "));
      const typeMatches = typeNeedle === undefined || text.includes(typeNeedle);
      const purposeMatches = purposeNeedle === undefined || text.includes(purposeNeedle) || purpose === "sale" && text.includes("للبيع") || purpose === "rent" && text.includes("للإيجار") || purpose === "booking" && text.includes("للحجز");
      return typeMatches && purposeMatches;
    });
    const ids = [...new Set(matches.map((category) => Number(category.id)).filter(Number.isFinite))];
    if (ids.length === 0)
      throw new AqarError(`No Aqar category matched type=${propertyType ?? "any"}, purpose=${purpose ?? "any"}. Try a numeric category ID.`);
    return ids;
  }
  async resolveCity(value, category) {
    if (typeof value === "number" || typeof value === "string" && /^\d+$/.test(value))
      return Number(value);
    const name = stringValue(value);
    if (name === undefined)
      throw new AqarError("--city must be a city name or numeric ID.");
    const data = await executeGraphql(this.config.endpoint, this.config.headers, CITIES_QUERY, { category }, this.fetcher);
    return findLocationId(arrayAt(data, "Web.cities"), name, "city_id", "city");
  }
  async resolveDistrict(value, cityId, category) {
    if (typeof value === "number" || typeof value === "string" && /^\d+$/.test(value))
      return Number(value);
    const name = stringValue(value);
    if (name === undefined)
      throw new AqarError("--district must be a district name or numeric ID.");
    const data = await executeGraphql(this.config.endpoint, this.config.headers, DISTRICTS_QUERY, { category, cityId }, this.fetcher);
    return findLocationId(arrayAt(data, "Web.districts"), name, "district_id", "district");
  }
}
var isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var stringValue = (value) => typeof value === "string" ? value.trim().toLowerCase() : undefined;
var numericValue = (value, name) => {
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new AqarError(`${name} must be a number.`);
  return number;
};
var normalizeName = (value) => value.toLowerCase().replace(/[-_]/g, " ").replace(/^حي\s+/, "").replace(/\s+/g, " ").trim();
var arrayAt = (value, path) => {
  const result = getPath(value, path);
  if (!Array.isArray(result))
    throw new AqarError(`GraphQL lookup path ${path} was not an array.`);
  return result;
};
var findLocationId = (values, requested, idField, label) => {
  const needle = normalizeName(requested);
  const match = values.find((value) => isObject(value) && [value.name, value.name_en].some((name) => typeof name === "string" && normalizeName(name) === needle));
  if (!isObject(match) || !Number.isFinite(Number(match[idField])))
    throw new AqarError(`Aqar ${label} not found: ${requested}. Use its numeric ID if the spelling differs.`);
  return Number(match[idField]);
};

// aqarcli/src/cli.ts
var usage = `Usage:
  aqar search [--city CITY] [--district DISTRICT] [--purpose sale|rent|booking] [--type TYPE] [--min-price AMOUNT] [--max-price AMOUNT] [--limit COUNT] [--variables JSON] [--json] [--config PATH]
  aqar get <id-or-url> [--json] [--config PATH]

The default backend is Aqar's internal GraphQL interface. City, district, and property type accept names or numeric IDs.`;
var bundledConfigPath = fileURLToPath(new URL("../aqar.config.json", import.meta.url));
var table = (listings) => {
  const rows = listings.map((listing) => [listing.id, listing.district, listing.price, listing.currency, listing.areaSqm].map((value) => value ?? "-"));
  const header = ["ID", "District", "Price", "Currency", "Area m2"];
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
    throw new AqarError("--variables must be a JSON object.");
  }
};
var numberOption = (value, name) => {
  if (value === undefined)
    return;
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new AqarError(`${name} must be a number.`);
  return number;
};
var run = async (argv) => {
  const [command, ...rest] = argv;
  if (command === undefined || command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }
  if (command !== "search" && command !== "get")
    throw new AqarError(`Unknown command ${command}.

${usage}`);
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      city: { type: "string" },
      district: { type: "string" },
      purpose: { type: "string" },
      type: { type: "string" },
      "min-price": { type: "string" },
      "max-price": { type: "string" },
      limit: { type: "string" },
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
      throw new AqarError("aqar get requires exactly one listing ID or URL.");
    const listing = await source.get(positionals[0]);
    console.log(values.json ? JSON.stringify(listing, null, 2) : table([listing]));
    return;
  }
  if (positionals.length > 0)
    throw new AqarError("aqar search does not accept positional arguments.");
  const variables = {
    ...parseJsonObject(values.variables),
    ...values.city === undefined ? {} : { city: values.city },
    ...values.district === undefined ? {} : { district: values.district },
    ...values.purpose === undefined ? {} : { purpose: values.purpose },
    ...values.type === undefined ? {} : { propertyType: values.type },
    ...values["min-price"] === undefined ? {} : { minPrice: numberOption(values["min-price"], "--min-price") },
    ...values["max-price"] === undefined ? {} : { maxPrice: numberOption(values["max-price"], "--max-price") },
    ...values.limit === undefined ? {} : { limit: numberOption(values.limit, "--limit") }
  };
  const listings = await source.search(variables);
  console.log(values.json ? JSON.stringify(listings, null, 2) : table(listings));
};

// aqarcli/src/bin.ts
run(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
