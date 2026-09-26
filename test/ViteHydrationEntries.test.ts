///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import fs from "node:fs";
import path from "node:path";
import viteConfig from "../vite.config.js";

/**
 * Every `.tsx` page under the app directories, at any depth, except `_`-prefixed files and directories (colocated
 * components and layouts) - the page convention `@rapidrest/react` 2.x documents and this project's routes rely on
 * (`apps/www/auth/signin.tsx`, `apps/admin/users/[uid].tsx`, ...).
 */
function pageFiles(appDir: string): string[] {
    const result: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir)) {
            if (entry.startsWith("_")) {
                continue;
            }
            const full: string = path.join(dir, entry);
            if (fs.statSync(full).isDirectory()) {
                walk(full);
            } else if (entry.endsWith(".tsx")) {
                result.push(path.relative(".", full).replace(/\\/g, "/"));
            }
        }
    };
    walk(appDir);
    return result;
}

/**
 * Guards the client build against the sign-in page silently losing its hydration entry: a page with no entry in the
 * client build's manifest can't be rendered at all (`ReactRoute` answers 500 - "hydrate=true requires
 * react.manifestPath to be configured and a matching Vite manifest entry"), which took the whole sign-in flow down when
 * `@rapidrest/react` was downgraded to 1.x, whose page scan only counts a *nested* `index.tsx` as a page.
 */
describe("Vite client build hydration entries", () => {
    async function entries(): Promise<string[]> {
        const config: any = await viteConfig;
        const plugin: any = (config.plugins as any[]).flat(Infinity).find((p: any) => p?.name === "rapidrest-hydration");
        expect(plugin).toBeDefined();
        return Object.keys(plugin.options({}).input);
    }

    it("has an entry for every page under apps/www and apps/admin, including nested non-index and dynamic-segment pages, and a router entry for each app", async () => {
        // The pages' entries stay under the client router: they aren't loaded, but the manifest records name the
        // stylesheets and chunks each page needs, which is how the server knows what to put in the page's HTML.
        const expected: string[] = [
            ...pageFiles("apps/www"),
            ...pageFiles("apps/admin"),
            "apps/www/__router",
            "apps/admin/__router",
        ];
        const actual: string[] = await entries();

        expect(actual.sort()).toEqual(expected.sort());
    });

    it("includes the sign-in flow's pages and a dynamic detail page by name", async () => {
        const actual: string[] = await entries();

        expect(actual).toEqual(
            expect.arrayContaining([
                "apps/www/auth/signin.tsx",
                "apps/www/auth/signup.tsx",
                "apps/www/auth/authorize.tsx",
                "apps/admin/users/[uid].tsx",
            ]),
        );
    });
});
