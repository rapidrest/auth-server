///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import { toTrustedOrigins } from "../src/routes/TrustedOrigins.js";

describe("toTrustedOrigins()", () => {
    it("keeps well-formed http(s) origins as-is", () => {
        expect(toTrustedOrigins(["https://mail.mydomain.com", "http://localhost:3000"])).toEqual([
            "https://mail.mydomain.com",
            "http://localhost:3000",
        ]);
    });

    it("reduces an entry with a path, trailing slash or default port to its bare origin", () => {
        expect(toTrustedOrigins(["https://mail.mydomain.com/inbox", "https://app.mydomain.com:443/"])).toEqual([
            "https://mail.mydomain.com",
            "https://app.mydomain.com",
        ]);
    });

    it("drops a CORS wildcard — it must never mean 'redirect anywhere'", () => {
        expect(toTrustedOrigins(["*", "https://mail.mydomain.com"])).toEqual(["https://mail.mydomain.com"]);
    });

    it("drops entries that aren't URLs, aren't strings, or aren't http(s)", () => {
        expect(toTrustedOrigins(["mail.mydomain.com", 42, null, "javascript:alert(1)", "ftp://x.com", ""])).toEqual([]);
    });

    it("removes duplicates", () => {
        expect(toTrustedOrigins(["https://a.com", "https://a.com/", "https://a.com/x"])).toEqual(["https://a.com"]);
    });

    it("accepts a comma-separated string, as an environment variable might supply", () => {
        expect(toTrustedOrigins("https://a.com, https://b.com")).toEqual(["https://a.com", "https://b.com"]);
    });

    it("returns an empty list for anything that isn't a list or string", () => {
        expect(toTrustedOrigins(undefined)).toEqual([]);
        expect(toTrustedOrigins({ origins: ["https://a.com"] })).toEqual([]);
    });
});
