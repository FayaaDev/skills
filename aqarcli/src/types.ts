export type JsonObject = Record<string, unknown>;

export type SearchOperation = {
  document: string;
  variables?: JsonObject;
  resultsPath: string;
};

export type GetOperation = {
  document: string;
  idVariable: string;
  resultPath: string;
};

export type ListingMapping = {
  id: string;
  title?: string;
  price?: string;
  currency?: string;
  city?: string;
  district?: string;
  propertyType?: string;
  areaSqm?: string;
  url?: string;
};

export type AqarConfig = {
  endpoint: string;
  headers?: Record<string, string>;
  operations: {
    search: SearchOperation;
    get: GetOperation;
  };
  listing: ListingMapping;
};

export type Listing = {
  id: string | number | null;
  title: string | null;
  price: number | string | null;
  currency: string | null;
  city: string | null;
  district: string | null;
  propertyType: string | null;
  areaSqm: number | null;
  url: string | null;
  source: "graphql";
  retrievedAt: string;
};
