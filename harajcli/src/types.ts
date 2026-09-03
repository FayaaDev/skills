export type JsonObject = Record<string, unknown>;

export type SearchOperation = {
  queryName: string;
  document: string;
  variables?: JsonObject;
  resultsPath: string;
};

export type GetOperation = {
  queryName: string;
  document: string;
  idVariable: string;
  resultPath: string;
};

export type HarajConfig = {
  endpoint: string;
  headers?: Record<string, string>;
  operations: { search: SearchOperation; get: GetOperation };
};

export type Listing = {
  id: number | null;
  title: string | null;
  price: string | number | null;
  priceDisplay: string | null;
  currency: "SAR" | null;
  city: string | null;
  district: string | null;
  tags: string[];
  imageUrls: string[];
  author: string | null;
  bodyText: string | null;
  url: string | null;
  source: "graphql";
  retrievedAt: string;
};
