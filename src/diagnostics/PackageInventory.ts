///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** How deep below the package root `node_modules` directories nested inside other packages are followed. */
const MAX_NESTING = 3;

export interface InstalledPackage {
    name: string;
    version: string;
}

export interface PackageInventory {
    /** The deployed package itself (`package.json`'s `name`/`version`). */
    name: string;
    version: string;
    /** Every package found under `node_modules`, sorted by name then version. */
    packages: InstalledPackage[];
}

/** Reads and parses a `package.json`, or `undefined` if it isn't there or isn't valid JSON. */
async function readManifest(path: string): Promise<{ name?: string; version?: string } | undefined> {
    try {
        return JSON.parse(await readFile(path, "utf-8"));
    } catch {
        return undefined;
    }
}

/** Walks up from `startDir` to the nearest directory holding a `package.json`. */
export async function findPackageRoot(startDir: string): Promise<string | undefined> {
    let dir = startDir;
    for (;;) {
        if (await readManifest(join(dir, "package.json"))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) {
            return undefined;
        }
        dir = parent;
    }
}

/** The entries of a directory, or none if it can't be read (it doesn't exist, or isn't a directory). */
async function listDir(dir: string): Promise<Dirent[]> {
    try {
        return await readdir(dir, { withFileTypes: true });
    } catch {
        return [];
    }
}

/** Reads the packages in one `node_modules` directory (following scopes and nested `node_modules`) into `found`. */
async function scanNodeModules(dir: string, depth: number, found: Map<string, InstalledPackage>): Promise<void> {
    const candidates: string[] = [];
    for (const entry of await listDir(dir)) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
            continue;
        }
        if (entry.name.startsWith("@")) {
            const scoped = await listDir(join(dir, entry.name));
            candidates.push(...scoped.map((pkg) => join(dir, entry.name, pkg.name)));
        } else if (!entry.name.startsWith(".")) {
            candidates.push(join(dir, entry.name));
        }
    }
    await Promise.all(
        candidates.map(async (path) => {
            const manifest = await readManifest(join(path, "package.json"));
            if (manifest?.name && manifest.version) {
                found.set(`${manifest.name}@${manifest.version}`, { name: manifest.name, version: manifest.version });
            }
            if (depth < MAX_NESTING) {
                await scanNodeModules(join(path, "node_modules"), depth + 1, found);
            }
        }),
    );
}

/**
 * Reads the deployed package's own name/version and every package installed under its `node_modules` (including
 * ones nested inside other packages, so two versions of the same package both appear). `startDir` is any directory
 * inside the package, typically this module's own.
 */
export async function readPackageInventory(startDir: string): Promise<PackageInventory> {
    const root = await findPackageRoot(startDir);
    const manifest = root ? await readManifest(join(root, "package.json")) : undefined;
    const found = new Map<string, InstalledPackage>();
    if (root) {
        await scanNodeModules(join(root, "node_modules"), 0, found);
    }
    const packages = [...found.values()].sort(
        (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
    );
    return { name: manifest?.name ?? "unknown", version: manifest?.version ?? "unknown", packages };
}
