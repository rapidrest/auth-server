import { createViteConfig } from "@rapidrest/react/vite";
import { mergeConfig } from "vite";

export default async () => {
    const www = await createViteConfig({ appDir: "apps/www" });
    const admin = await createViteConfig({ appDir: "apps/admin" });
    return mergeConfig(www, {
        // admin's own hydration-entry-discovery plugin, added alongside www's so a single build
        // produces one shared manifest/outDir covering both apps' entry points.
        plugins: [admin.plugins[1]],
        build: {
            rollupOptions: {
                input: {},
            },
        },
    });
};
