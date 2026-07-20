import { createViteConfig } from "@rapidrest/react/vite";
import { mergeConfig } from "vite";

export default async () => {
    const base = await createViteConfig({ appDir: "apps/www" });
    return mergeConfig(base, {
        build: {
            rollupOptions: {
                input: {},
            },
        },
    });
};
