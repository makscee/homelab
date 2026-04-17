import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  queryInstant,
  queryRange,
  PromQueryError,
} from "./prometheus.server";

type FetchLike = typeof globalThis.fetch;

const originalFetch = globalThis.fetch;
let lastUrl = "";
let lastInit: RequestInit | undefined;

function installFetch(impl: FetchLike): void {
  (globalThis as { fetch: FetchLike }).fetch = impl;
}

function restoreFetch(): void {
  (globalThis as { fetch: FetchLike }).fetch = originalFetch;
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  lastUrl = "";
  lastInit = undefined;
});

afterEach(() => {
  restoreFetch();
});

describe("queryInstant", () => {
  test("parses success/vector payload into PromInstantSample[]", async () => {
    installFetch(async (input, init) => {
      lastUrl = typeof input === "string" ? input : (input as Request).url;
      lastInit = init;
      return okJson({
        status: "success",
        data: {
          resultType: "vector",
          result: [
            { metric: { token_id: "a", label: "gamma" }, value: [1700000000, "0.42"] },
            { metric: { token_id: "b", label: "delta" }, value: [1700000000.5, "1"] },
          ],
        },
      });
    });
    const samples = await queryInstant("up");
    expect(samples.length).toBe(2);
    expect(samples[0]).toEqual({
      labels: { token_id: "a", label: "gamma" },
      value: 0.42,
      ts: 1700000000,
    });
    expect(samples[1].value).toBe(1);
    expect(samples[1].ts).toBeCloseTo(1700000000.5);
  });

  test("URL-encodes the promql query parameter", async () => {
    installFetch(async (input) => {
      lastUrl = typeof input === "string" ? input : (input as Request).url;
      return okJson({ status: "success", data: { resultType: "vector", result: [] } });
    });
    await queryInstant('sum(rate(http_requests_total{job="api"}[5m]))');
    // URLSearchParams encodes `{`, `"`, `[`, spaces, etc.
    expect(lastUrl).toContain("/api/v1/query?");
    expect(lastUrl).toContain("query=");
    // Neither raw braces nor quotes must appear verbatim in the URL.
    expect(lastUrl).not.toContain('{job="api"}');
    // The decoded form should round-trip.
    const u = new URL(lastUrl);
    expect(u.searchParams.get("query")).toBe(
      'sum(rate(http_requests_total{job="api"}[5m]))',
    );
  });

  test("uses cache: no-store for live instant queries", async () => {
    installFetch(async (input, init) => {
      lastUrl = typeof input === "string" ? input : (input as Request).url;
      lastInit = init;
      return okJson({ status: "success", data: { resultType: "vector", result: [] } });
    });
    await queryInstant("up");
    expect((lastInit as RequestInit | undefined)?.cache).toBe("no-store");
  });
});

describe("queryRange", () => {
  test("parses success/matrix payload into PromRangeSeries[]", async () => {
    installFetch(async () =>
      okJson({
        status: "success",
        data: {
          resultType: "matrix",
          result: [
            {
              metric: { token_id: "a" },
              values: [
                [1700000000, "0.10"],
                [1700000060, "0.20"],
              ],
            },
          ],
        },
      }),
    );
    const series = await queryRange(
      "rate(x[1m])",
      new Date(1700000000_000),
      new Date(1700000600_000),
      60,
    );
    expect(series.length).toBe(1);
    expect(series[0].labels).toEqual({ token_id: "a" });
    expect(series[0].samples).toEqual([
      [1700000000, 0.1],
      [1700000060, 0.2],
    ]);
  });

  test("computes start/end as unix seconds (fractional allowed) and step as integer seconds", async () => {
    installFetch(async (input, init) => {
      lastUrl = typeof input === "string" ? input : (input as Request).url;
      lastInit = init;
      return okJson({
        status: "success",
        data: { resultType: "matrix", result: [] },
      });
    });
    // 1_700_000_000_250 ms → 1_700_000_000.25 s
    const start = new Date(1700000000_250);
    const end = new Date(1700000600_750);
    await queryRange("up", start, end, 60.9, { revalidateSec: 30 });
    const u = new URL(lastUrl);
    expect(u.pathname).toBe("/api/v1/query_range");
    expect(u.searchParams.get("start")).toBe("1700000000.25");
    expect(u.searchParams.get("end")).toBe("1700000600.75");
    // stepSec is floored to an integer second count; minimum is 1.
    expect(u.searchParams.get("step")).toBe("60");
    // When revalidateSec is passed the caller opts into ISR-style caching.
    expect((lastInit as { next?: { revalidate: number } } | undefined)?.next?.revalidate).toBe(30);
  });
});

describe("error paths", () => {
  test("non-success response throws PromQueryError without echoing promql", async () => {
    installFetch(async () =>
      okJson({ status: "error", errorType: "bad_data", error: "whatever secret" }),
    );
    let caught: unknown;
    try {
      await queryInstant("some promql that must not leak");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PromQueryError);
    const err = caught as PromQueryError;
    expect(err.message).not.toContain("some promql that must not leak");
    expect(err.message.toLowerCase()).toContain("bad_data");
  });

  test("network error throws PromQueryError with a generic message", async () => {
    installFetch(async () => {
      throw new Error("ECONNREFUSED something-secret-here");
    });
    let caught: unknown;
    try {
      await queryInstant("x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PromQueryError);
    const err = caught as PromQueryError;
    expect(err.message).not.toContain("something-secret-here");
    expect(err.message).toBe("prometheus unreachable");
    expect(err.status).toBe(0);
  });
});
