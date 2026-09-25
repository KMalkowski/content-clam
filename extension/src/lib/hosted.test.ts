import { describe, expect, it } from "vitest";
import { tokenSubject } from "./hosted";

const encode = (value: object) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("tokenSubject", () => {
  it("reads the account id from a session token", () => {
    expect(tokenSubject(`${encode({ alg: "RS256" })}.${encode({ sub: "user_a", n: "?>?" })}.sig`)).toBe("user_a");
  });

  it("returns nothing for a malformed token", () => {
    expect(tokenSubject("not-a-token")).toBeUndefined();
    expect(tokenSubject(`x.${encode({ sub: 42 })}.y`)).toBeUndefined();
  });
});
