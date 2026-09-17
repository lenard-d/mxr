import { describe, expect, test } from "vitest";

import { domainFaviconUrl, domainFaviconUrls, emailDomain } from "./emailDomain";

describe("emailDomain", () => {
  test.each([
    ["lenard@gmail.com", "gmail.com"],
    ["Lenard <LENARD@Example.COM>", "example.com"],
    [" mail@sub.example.com. ", "sub.example.com"],
  ])("extracts a safe hostname from %s", (address, expected) => {
    expect(emailDomain(address)).toBe(expected);
  });

  test.each(["", "missing-at.example.com", "x@https://example.com", "x@example.com/path", "x@localhost"])(
    "rejects malformed or non-public domains: %s",
    (address) => expect(emailDomain(address)).toBeNull(),
  );

  test("builds a direct domain favicon URL", () => {
    expect(domainFaviconUrl("me@example.com")).toBe("https://example.com/favicon.ico");
    expect(domainFaviconUrls("me@example.com")).toEqual([
      "https://example.com/favicon.ico",
      "https://www.google.com/s2/favicons?domain=example.com&sz=64",
    ]);
  });
});
