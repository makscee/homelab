import { test, expect } from "bun:test";
import { redactPayload, TOKEN_PATTERN } from "./redact.server";

// Behavior 1: string matching TOKEN_PATTERN is redacted
test("redacts a bare token string", () => {
  expect(redactPayload("sk-ant-oat01-abc123")).toBe("[REDACTED]");
});

// Behavior 2: deny-list key in object is redacted, safe key passes through
test("redacts deny-list key in flat object", () => {
  const result = redactPayload({ password: "hunter2", label: "ok" }) as Record<string, unknown>;
  expect(result.password).toBe("[REDACTED]");
  expect(result.label).toBe("ok");
});

// Behavior 3: nested object with deny-list key
test("redacts deny-list key in nested object", () => {
  const result = redactPayload({ nested: { token: "x", safe: 1 } }) as Record<string, unknown>;
  const nested = result.nested as Record<string, unknown>;
  expect(nested.token).toBe("[REDACTED]");
  expect(nested.safe).toBe(1);
});

// Behavior 4: array with object containing deny-list key
test("redacts deny-list key inside array elements", () => {
  const result = redactPayload([{ api_key: "k" }, "ok"]) as unknown[];
  const first = result[0] as Record<string, unknown>;
  expect(first.api_key).toBe("[REDACTED]");
  expect(result[1]).toBe("ok");
});

// Behavior 5: null/number/boolean pass through unchanged
test("passes through null, number, boolean", () => {
  expect(redactPayload(null)).toBeNull();
  expect(redactPayload(123)).toBe(123);
  expect(redactPayload(true)).toBe(true);
});

// Behavior 6: case-insensitive key match (Authorization)
test("redacts deny-list key case-insensitively (Authorization)", () => {
  const result = redactPayload({ Authorization: "Bearer x" }) as Record<string, unknown>;
  expect(result.Authorization).toBe("[REDACTED]");
});

// Behavior 7: token pattern embedded in a string substring
test("redacts token pattern substring in a string value", () => {
  const result = redactPayload("hello sk-ant-oat01-foo bar");
  expect(result).toBe("hello [REDACTED] bar");
});

// Extra: all deny keys covered
test("redacts all deny-list keys: secret, apikey, auth, value, cookie", () => {
  const result = redactPayload({
    secret: "s",
    apikey: "a",
    auth: "b",
    value: "v",
    cookie: "c",
    safe: "ok",
  }) as Record<string, unknown>;
  expect(result.secret).toBe("[REDACTED]");
  expect(result.apikey).toBe("[REDACTED]");
  expect(result.auth).toBe("[REDACTED]");
  expect(result.value).toBe("[REDACTED]");
  expect(result.cookie).toBe("[REDACTED]");
  expect(result.safe).toBe("ok");
});
