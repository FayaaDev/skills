import { AqarError } from "./errors.js";
import { executeGraphql, type FetchLike } from "./graphql.js";
import { getPath, normalizeListing } from "./normalize.js";
import type { AqarConfig, JsonObject, Listing } from "./types.js";

const CATEGORIES_QUERY = `query AqarCategories {
  Web {
    en: categories(lang: en) { id name plural uri }
    ar: categories(lang: ar) { id name plural uri }
  }
}`;

const CITIES_QUERY = `query AqarCities($category: Int!) {
  Web { cities(category: $category) { city_id name name_en } }
}`;

const DISTRICTS_QUERY = `query AqarDistricts($category: Int!, $cityId: Int!) {
  Web { districts(category: $category, city_id: $cityId) { district_id name name_en } }
}`;

export class GraphqlSource {
  constructor(private readonly config: AqarConfig, private readonly fetcher: FetchLike = fetch) {}

  async search(variables: JsonObject): Promise<Listing[]> {
    const operation = this.config.operations.search;
    const { city, district, purpose, propertyType, minPrice, maxPrice, limit, ...sourceVariables } = variables;
    const where = isObject(sourceVariables.where) ? sourceVariables.where : {};
    const categoryIds = await this.resolveCategories(stringValue(propertyType), stringValue(purpose));
    if (categoryIds.length === 1) where.category = { eq: categoryIds[0] };
    if (categoryIds.length > 1) where.category = { inar: categoryIds };

    const lookupCategory = categoryIds[0] ?? 0;
    const cityId = city === undefined ? undefined : await this.resolveCity(city, lookupCategory);
    if (cityId !== undefined) where.city_id = { eq: cityId };
    if (district !== undefined) {
      if (cityId === undefined) throw new AqarError("--district requires --city so Aqar can resolve the district.");
      where.district_id = { eq: await this.resolveDistrict(district, cityId, lookupCategory) };
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {
        ...(minPrice === undefined ? {} : { gte: numericValue(minPrice, "minimum price") }),
        ...(maxPrice === undefined ? {} : { lte: numericValue(maxPrice, "maximum price") })
      };
    }

    const requestedLimit = limit === undefined ? undefined : numericValue(limit, "limit");
    if (requestedLimit !== undefined && requestedLimit < 1) throw new AqarError("--limit must be at least 1.");
    const requestVariables = {
      ...(operation.variables ?? {}),
      ...sourceVariables,
      where,
      ...(requestedLimit === undefined ? {} : { size: Math.min(requestedLimit, 100) })
    };
    const data = await executeGraphql(this.config.endpoint, this.config.headers, operation.document, requestVariables, this.fetcher);
    const results = getPath(data, operation.resultsPath);
    if (!Array.isArray(results)) throw new AqarError(`GraphQL search result path ${operation.resultsPath} was not an array.`);
    return results.map((result) => this.normalize(result));
  }

  async get(id: string): Promise<Listing> {
    const operation = this.config.operations.get;
    const match = id.match(/(?:^|[-/])(\d+)(?:[/?#].*)?$/);
    if (match === null) throw new AqarError("Listing must be a numeric ID or an Aqar URL ending in a listing ID.");
    const identifier = Number(match[1]);
    const data = await executeGraphql(this.config.endpoint, this.config.headers, operation.document, { [operation.idVariable]: identifier }, this.fetcher);
    const result = getPath(data, operation.resultPath);
    if (result === undefined || result === null) throw new AqarError(`Listing ${id} was not found at GraphQL result path ${operation.resultPath}.`);
    return this.normalize(result);
  }

  private normalize(value: unknown): Listing {
    const listing = normalizeListing(value, this.config.listing);
    if (listing.url !== null && !/^https?:\/\//.test(listing.url)) {
      listing.url = new URL(listing.url, "https://sa.aqar.fm").href;
    }
    if (listing.price !== null && listing.currency === null) listing.currency = "SAR";
    return listing;
  }

  private async resolveCategories(propertyType: string | undefined, purpose: string | undefined): Promise<number[]> {
    if (propertyType !== undefined && /^\d+$/.test(propertyType)) return [Number(propertyType)];
    if (propertyType === undefined && purpose === undefined) return [];
    if (purpose !== undefined && purpose !== "sale" && purpose !== "rent" && purpose !== "booking") {
      throw new AqarError("--purpose must be sale, rent, or booking.");
    }

    const data = await executeGraphql(this.config.endpoint, this.config.headers, CATEGORIES_QUERY, {}, this.fetcher);
    const categories = [...arrayAt(data, "Web.en"), ...arrayAt(data, "Web.ar")];
    const typeNeedle = propertyType === undefined ? undefined : normalizeName(propertyType);
    const purposeNeedle = purpose === undefined ? undefined : purpose === "sale" ? "for sale" : purpose === "rent" ? "for rent" : "for booking";
    const matches = categories.filter((category) => {
      if (!isObject(category)) return false;
      const text = normalizeName([category.name, category.plural, category.uri].filter((part) => typeof part === "string").join(" "));
      const typeMatches = typeNeedle === undefined || text.includes(typeNeedle);
      const purposeMatches = purposeNeedle === undefined || text.includes(purposeNeedle) || (purpose === "sale" && text.includes("للبيع")) || (purpose === "rent" && text.includes("للإيجار")) || (purpose === "booking" && text.includes("للحجز"));
      return typeMatches && purposeMatches;
    });
    const ids = [...new Set(matches.map((category) => Number((category as JsonObject).id)).filter(Number.isFinite))];
    if (ids.length === 0) throw new AqarError(`No Aqar category matched type=${propertyType ?? "any"}, purpose=${purpose ?? "any"}. Try a numeric category ID.`);
    return ids;
  }

  private async resolveCity(value: unknown, category: number): Promise<number> {
    if (typeof value === "number" || typeof value === "string" && /^\d+$/.test(value)) return Number(value);
    const name = stringValue(value);
    if (name === undefined) throw new AqarError("--city must be a city name or numeric ID.");
    const data = await executeGraphql(this.config.endpoint, this.config.headers, CITIES_QUERY, { category }, this.fetcher);
    return findLocationId(arrayAt(data, "Web.cities"), name, "city_id", "city");
  }

  private async resolveDistrict(value: unknown, cityId: number, category: number): Promise<number> {
    if (typeof value === "number" || typeof value === "string" && /^\d+$/.test(value)) return Number(value);
    const name = stringValue(value);
    if (name === undefined) throw new AqarError("--district must be a district name or numeric ID.");
    const data = await executeGraphql(this.config.endpoint, this.config.headers, DISTRICTS_QUERY, { category, cityId }, this.fetcher);
    return findLocationId(arrayAt(data, "Web.districts"), name, "district_id", "district");
  }
}

const isObject = (value: unknown): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value);
const stringValue = (value: unknown): string | undefined => typeof value === "string" ? value.trim().toLowerCase() : undefined;
const numericValue = (value: unknown, name: string): number => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new AqarError(`${name} must be a number.`);
  return number;
};
const normalizeName = (value: string): string => value.toLowerCase().replace(/[-_]/g, " ").replace(/^حي\s+/, "").replace(/\s+/g, " ").trim();
const arrayAt = (value: unknown, path: string): unknown[] => {
  const result = getPath(value, path);
  if (!Array.isArray(result)) throw new AqarError(`GraphQL lookup path ${path} was not an array.`);
  return result;
};
const findLocationId = (values: unknown[], requested: string, idField: string, label: string): number => {
  const needle = normalizeName(requested);
  const match = values.find((value) => isObject(value) && [value.name, value.name_en].some((name) => typeof name === "string" && normalizeName(name) === needle));
  if (!isObject(match) || !Number.isFinite(Number(match[idField]))) throw new AqarError(`Aqar ${label} not found: ${requested}. Use its numeric ID if the spelling differs.`);
  return Number(match[idField]);
};
