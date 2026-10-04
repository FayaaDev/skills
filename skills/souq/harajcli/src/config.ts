import { readFile } from "node:fs/promises";
import { HarajError } from "./errors.js";
import type { HarajConfig, JsonObject } from "./types.js";

const requiredString = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.length === 0) throw new HarajError(`Configuration requires ${name}.`);
  return value;
};

const object = (value: unknown, name: string): JsonObject => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new HarajError(`Configuration requires ${name} to be an object.`);
  return value as JsonObject;
};

const headers = (value: unknown): Record<string, string> | undefined => {
  if (value === undefined) return undefined;
  return Object.fromEntries(Object.entries(object(value, "headers")).map(([name, header]) => [name, requiredString(header, `headers.${name}`)]));
};

export const loadConfig = async (path: string): Promise<HarajConfig> => {
  let parsed: unknown;
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
