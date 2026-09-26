///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, parse } from "path";
import { afterAll, describe, expect, it } from "vitest";
import { findPackageRoot, readPackageInventory } from "../src/diagnostics/PackageInventory.js";

const root = mkdtempSync(join(tmpdir(), "inventory-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function pkg(dir: string, name: string, version: string) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version }));
}

describe("readPackageInventory", () => {
    it("reads the deployed package and every installed package, scoped and nested, sorted", async () => {
        const app = join(root, "app");
        pkg(app, "my-app", "1.2.3");
        mkdirSync(join(app, "src/deep"), { recursive: true });
        const nm = join(app, "node_modules");
        pkg(join(nm, "zeta"), "zeta", "1.0.0");
        pkg(join(nm, "alpha"), "alpha", "2.0.0");
        pkg(join(nm, "@scope/thing"), "@scope/thing", "3.1.0");
        // Two versions of the same package: the hoisted one and one nested inside another package.
        pkg(join(nm, "alpha/node_modules/zeta"), "zeta", "0.9.0");
        // Never reported: dot-directories, plain files, directories without a manifest, and manifests without a version.
        pkg(join(nm, ".cache"), "hidden", "1.0.0");
        writeFileSync(join(nm, "README.md"), "x");
        mkdirSync(join(nm, "not-a-package"), { recursive: true });
        mkdirSync(join(nm, "nameless"), { recursive: true });
        writeFileSync(join(nm, "nameless/package.json"), JSON.stringify({ name: "nameless" }));
        mkdirSync(join(nm, "broken"), { recursive: true });
        writeFileSync(join(nm, "broken/package.json"), "{not json");
        // A scope directory holding nothing.
        mkdirSync(join(nm, "@emptyscope"), { recursive: true });
        // Symlinked packages (how workspaces/portals appear) are followed.
        pkg(join(root, "linked-target"), "linked", "4.0.0");
        symlinkSync(join(root, "linked-target"), join(nm, "linked"), "junction");
        // Nesting deeper than the limit is not followed.
        pkg(join(nm, "a"), "a", "1.0.0");
        pkg(join(nm, "a/node_modules/b"), "b", "1.0.0");
        pkg(join(nm, "a/node_modules/b/node_modules/c"), "c", "1.0.0");
        pkg(join(nm, "a/node_modules/b/node_modules/c/node_modules/d"), "d", "1.0.0");
        pkg(join(nm, "a/node_modules/b/node_modules/c/node_modules/d/node_modules/e"), "too-deep", "1.0.0");

        const inventory = await readPackageInventory(join(app, "src/deep"));

        expect(inventory.name).toBe("my-app");
        expect(inventory.version).toBe("1.2.3");
        expect(inventory.packages).toEqual([
            { name: "@scope/thing", version: "3.1.0" },
            { name: "a", version: "1.0.0" },
            { name: "alpha", version: "2.0.0" },
            { name: "b", version: "1.0.0" },
            { name: "c", version: "1.0.0" },
            { name: "d", version: "1.0.0" },
            { name: "linked", version: "4.0.0" },
            { name: "zeta", version: "0.9.0" },
            { name: "zeta", version: "1.0.0" },
        ]);
    });

    it("reports an unknown package with nothing installed when there is no node_modules", async () => {
        const bare = join(root, "bare");
        mkdirSync(bare, { recursive: true });
        writeFileSync(join(bare, "package.json"), "{}");
        expect(await readPackageInventory(bare)).toEqual({ name: "unknown", version: "unknown", packages: [] });
    });

    it("reports an unknown package when no package.json is found at all", async () => {
        // The filesystem root: nothing above it to find.
        const fsRoot = parse(root).root;
        expect(await findPackageRoot(fsRoot)).toBeUndefined();
        expect(await readPackageInventory(fsRoot)).toEqual({ name: "unknown", version: "unknown", packages: [] });
    });
});
