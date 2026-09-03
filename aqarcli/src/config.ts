import { readFile } from "node:fs/promises";
import { AqarError } from "./errors.js";
import type { AqarConfig, JsonObject } from "./types.js";

const requiredString = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new AqarError(`Configuration requires ${name}.`);
  }
  return value;
};

const object = (value: unknown, name: string): JsonObject => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AqarError(`Configuration requires ${name} to be an object.`);
  }
  return value as JsonObject;
};

const expandHeaders = (value: unknown): Record<string, string> | undefined => {
  if (value === undefined) return undefined;
  const headers = object(value, "headers");
  return Object.fromEntries(Object.entries(headers).map(([name, header]) => {
    const source = requiredString(header, `headers.${name}`);
    const expanded = source.replace(/\$\{([A-Z0-9_]+)\}/g, (_, variable: string) => {
      const value = process.env[variable];
      if (value === undefined) throw new AqarError(`Environment variable ${variable} required by headers.${name} is not set.`);
      return value;
    });
    return [name, expanded];
  }));
};

export const loadConfig = async (path: string): Promise<AqarConfig> => {
  let parsed: unknown;
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

const optionalString = (value: unknown, name: string): string | undefined => {
  if (value === undefined) return undefined;
  return requiredString(value, name);
};
