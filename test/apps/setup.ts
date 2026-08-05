///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Global setup for the frontend (apps/www) test suite. Vitest applies `setupFiles` across every test
// environment configured for this project, including the plain `node` environment the backend
// `test/**/*.test.ts` suite runs under — guard everything here on `document` actually existing so this
// file is a no-op for those tests rather than throwing on a DOM API that isn't present.
import "@testing-library/jest-dom/vitest";

if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    afterEach(() => {
        cleanup();
    });
}
