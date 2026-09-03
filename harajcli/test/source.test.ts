import assert from "node:assert/strict";
import { test } from "node:test";
import { HarajError } from "../src/errors.js";
import { executeGraphql } from "../src/graphql.js";
import { GraphqlSource } from "../src/source.js";
import type { HarajConfig } from "../src/types.js";

const config: HarajConfig = {
  endpoint: "https://api.example.test/graphql?clientId=guest&version=1",
  operations: {
    search: { queryName: "search", document: "query Search { search { items { id } } }", variables: { page: 0, limit: 20, onlyWithImage: true }, resultsPath: "search.items" },
    get: { queryName: "posts", document: "query Get { posts { items { id } } }", idVariable: "id", resultPath: "posts.items.0" }
  }
};

test("search sends public endpoint parameters and explicit filters", async () => {
  let request: Request | undefined;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ data: { search: { items: [{ id: 12, title: "Camry", URL: "/112", geoCity: "Riyadh", geoNeighborhood: "Al Narjis", tags: ["Toyota"], imagesList: ["https://image.test/a.jpg"], authorUsername: "seller", price: { inputPrice: "50000", formattedPrice: "50,000" } }, { id: 13, URL: "/113" }] } } }));
  };
  const listings = await new GraphqlSource(config, fetcher as typeof fetch).search("camry", { city: "الرياض", limit: 1, onlyWithImage: false });

  assert.equal(request!.url, "https://api.example.test/graphql?clientId=guest&version=1&queryName=search");
  assert.deepEqual(JSON.parse(await request!.text()), { query: config.operations.search.document, variables: { page: 0, limit: 1, onlyWithImage: false, city: "الرياض", search: "camry" } });
  assert.equal(request!.headers.get("trackid"), "");
  assert.equal(listings.length, 1);
  assert.deepEqual(listings[0], {
    id: 12, title: "Camry", price: "50000", priceDisplay: "50,000", currency: "SAR", city: "Riyadh", district: "Al Narjis", tags: ["Toyota"], imageUrls: ["https://image.test/a.jpg"], author: "seller", bodyText: null, url: "https://haraj.com.sa/112", source: "graphql", retrievedAt: listings[0].retrievedAt
  });
});

test("get sends a numeric ID as the required single-element array", async () => {
  let variables: Record<string, unknown> | undefined;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    variables = JSON.parse(await new Request(input, init).text()).variables;
    return new Response(JSON.stringify({ data: { posts: { items: [{ id: 123, URL: "123" }] } } }));
  };
  const listing = await new GraphqlSource(config, fetcher as typeof fetch).get("https://haraj.com.sa/1123");
  assert.deepEqual(variables, { id: [1123] });
  assert.equal(listing.id, 123);
});

test("get extracts the GraphQL post ID from a canonical Haraj URL", async () => {
  let variables: Record<string, unknown> | undefined;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    variables = JSON.parse(await new Request(input, init).text()).variables;
    return new Response(JSON.stringify({ data: { posts: { items: [{ id: 187108979, URL: "/11187108979/" }] } } }));
  };
  await new GraphqlSource(config, fetcher as typeof fetch).get("https://haraj.com.sa/11187108979/تويوتا_فورتشنر_2015_للبيع/");
  assert.deepEqual(variables, { id: [187108979] });
});

test("search filters returned body text without sending it as a GraphQL variable", async () => {
  let variables: Record<string, unknown> | undefined;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    variables = JSON.parse(await new Request(input, init).text()).variables;
    return new Response(JSON.stringify({ data: { search: { items: [
      { id: 1, bodyTEXT: "الممشى: 322,000 كم" },
      { id: 2, bodyTEXT: "الممشى: 100,000 كم" }
    ] } } }));
  };
  const listings = await new GraphqlSource(config, fetcher as typeof fetch).search("toyota", { bodyText: "الممشى: 322,000 كم", limit: 10 });
  assert.deepEqual(variables, { page: 0, limit: 10, onlyWithImage: true, search: "toyota" });
  assert.deepEqual(listings.map((listing) => listing.id), [1]);
  assert.equal(listings[0].bodyText, "الممشى: 322,000 كم");
});

test("search rejects invalid configured result paths and limits", async () => {
  const fetcher = async () => new Response(JSON.stringify({ data: { search: {} } }));
  await assert.rejects(new GraphqlSource(config, fetcher as typeof fetch).search("camry", {}), (error: unknown) => error instanceof HarajError && error.message.includes("was not an array"));
  await assert.rejects(new GraphqlSource(config, fetcher as typeof fetch).search("camry", { limit: 0 }), (error: unknown) => error instanceof HarajError && error.message.includes("1 to 100"));
});

test("GraphQL errors are surfaced even on successful HTTP responses", async () => {
  const fetcher = async () => new Response(JSON.stringify({ errors: [{ message: "Unknown field" }] }));
  await assert.rejects(executeGraphql("https://api.example.test/graphql", "search", undefined, "query Test { x }", {}, fetcher as typeof fetch), (error: unknown) => error instanceof HarajError && error.message === "GraphQL error: Unknown field");
});
