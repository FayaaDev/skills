import assert from "node:assert/strict";
import { test } from "node:test";
import { AqarError } from "../src/errors.js";
import { executeGraphql } from "../src/graphql.js";
import { normalizeListing } from "../src/normalize.js";
import { GraphqlSource } from "../src/source.js";
import type { AqarConfig } from "../src/types.js";

const config: AqarConfig = {
  endpoint: "https://api.example.test/graphql",
  operations: {
    search: { document: "query Search { search { id } }", resultsPath: "search.results" },
    get: { document: "query Get($id: Int!) { listing { id } }", idVariable: "id", resultPath: "listing" }
  },
  listing: {
    id: "id", title: "title", price: "price.amount", currency: "price.currency", city: "location.city", district: "location.district", propertyType: "type", areaSqm: "area", url: "url"
  }
};

test("GraphqlSource sends filters and normalizes search results", async () => {
  let request: Request | undefined;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ data: { search: { results: [{ id: 12, title: "Apartment", price: { amount: 55000, currency: "SAR" }, location: { city: "Riyadh", district: "Al Narjis" }, type: "apartment", area: 120, url: "https://sa.aqar.fm/x" }] } } }));
  };
  const listings = await new GraphqlSource(config, fetcher as typeof fetch).search({ city: "21", propertyType: "1", limit: 1 });

  assert.deepEqual(JSON.parse(await request!.text()), {
    query: config.operations.search.document,
    variables: { where: { category: { eq: 1 }, city_id: { eq: 21 } }, size: 1 }
  });
  assert.equal(request!.method, "POST");
  assert.equal(listings[0].id, 12);
  assert.equal(listings[0].areaSqm, 120);
  assert.equal(listings[0].source, "graphql");
});

test("GraphqlSource reports invalid configured result paths", async () => {
  const fetcher = async () => new Response(JSON.stringify({ data: { search: {} } }));
  await assert.rejects(new GraphqlSource(config, fetcher as typeof fetch).search({}), (error: unknown) => error instanceof AqarError && error.message.includes("was not an array"));
});

test("source variables replace configured sort rather than combining sort fields", async () => {
  let request: Request | undefined;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ data: { search: { results: [] } } }));
  };
  const configured: AqarConfig = {
    ...config,
    operations: {
      ...config.operations,
      search: { ...config.operations.search, variables: { sort: { refresh: "desc" }, size: 20 } }
    }
  };

  await new GraphqlSource(configured, fetcher as typeof fetch).search({ sort: { price: "asc" }, limit: 5 });
  assert.deepEqual(JSON.parse(await request!.text()).variables, { sort: { price: "asc" }, size: 5, where: {} });
});

test("GraphqlSource sends numeric listing IDs as numbers", async () => {
  let request: Request | undefined;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ data: { listing: { id: 123 } } }));
  };
  const listing = await new GraphqlSource(config, fetcher as typeof fetch).get("123");

  assert.deepEqual(JSON.parse(await request!.text()), { query: config.operations.get.document, variables: { id: 123 } });
  assert.equal(listing.id, 123);
});

test("GraphqlSource resolves category, city, and district names", async () => {
  const requests: Array<{ query: string; variables: Record<string, unknown> }> = [];
  const responses = [
    { data: { Web: { en: [{ id: 1, name: "Apartment for rent", plural: "Apartments for rent", uri: "Apartment-for-rent" }], ar: [] } } },
    { data: { Web: { cities: [{ city_id: 21, name: "الرياض", name_en: "Riyadh" }] } } },
    { data: { Web: { districts: [{ district_id: 57, name: "حي النرجس", name_en: "Al Narjis" }] } } },
    { data: { search: { results: [{ id: 123, url: "/listing-123", price: { amount: 60000 } }] } } }
  ];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(JSON.parse(await request.text()));
    return new Response(JSON.stringify(responses.shift()));
  };

  const listings = await new GraphqlSource(config, fetcher as typeof fetch).search({
    city: "riyadh", district: "النرجس", propertyType: "apartment", purpose: "rent", maxPrice: 60000
  });

  assert.deepEqual(requests[3].variables, {
    where: { category: { eq: 1 }, city_id: { eq: 21 }, district_id: { eq: 57 }, price: { lte: 60000 } }
  });
  assert.equal(listings[0].url, "https://sa.aqar.fm/listing-123");
  assert.equal(listings[0].currency, "SAR");
});

test("GraphqlSource extracts listing IDs from Aqar URLs", async () => {
  let variables: Record<string, unknown> | undefined;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    variables = JSON.parse(await request.text()).variables;
    return new Response(JSON.stringify({ data: { listing: { id: 6736135 } } }));
  };

  await new GraphqlSource(config, fetcher as typeof fetch).get("https://sa.aqar.fm/villa-for-sale-6736135");
  assert.deepEqual(variables, { id: 6736135 });
});

test("GraphQL errors are surfaced even on successful HTTP responses", async () => {
  const fetcher = async () => new Response(JSON.stringify({ errors: [{ message: "Unknown field" }] }));
  await assert.rejects(executeGraphql("https://api.example.test/graphql", undefined, "query Test { x }", {}, fetcher as typeof fetch), (error: unknown) => error instanceof AqarError && error.message === "GraphQL error: Unknown field");
});

test("normalization uses null for absent optional source fields", () => {
  const listing = normalizeListing({ id: "abc", price: { amount: "60000" } }, config.listing, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(listing, {
    id: "abc", title: null, price: "60000", currency: null, city: null, district: null, propertyType: null, areaSqm: null, url: null, source: "graphql", retrievedAt: "2026-01-01T00:00:00.000Z"
  });
});
