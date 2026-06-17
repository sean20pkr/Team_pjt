import { readFileSync } from "node:fs";
import path from "node:path";

export type SummaryRow = Record<string, string | number>;
export type EventRow = Record<string, string | number>;
export type ProductRow = Record<string, string | number>;
export type FactRow = Record<string, string | number>;

export type MockBundle = {
  channel_profile: Record<string, string | number>[];
  product_profile: Record<string, string | number>[];
  monthly_summary: SummaryRow[];
  monthly_events: EventRow[];
  special_products: ProductRow[];
  main_fact: FactRow[];
};

let cachedBundle: MockBundle | null = null;

export function getMockBundle(): MockBundle {
  if (!cachedBundle) {
    const filePath = path.join(
      process.cwd(),
      "dummy_data_output",
      "dummy_data_bundle.json",
    );
    const raw = readFileSync(filePath, "utf8");
    cachedBundle = JSON.parse(raw) as MockBundle;
  }

  return cachedBundle;
}

export function toNumber(value: string | number | undefined): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function toText(value: string | number | undefined): string {
  if (value === undefined) {
    return "";
  }

  return String(value);
}

