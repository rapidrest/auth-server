///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useMemo, useState } from "react";
import Button from "../../buttons/Button.js";
import type { DiagnosticsVersions } from "./diagnosticsApi.js";
import Badge from "./Badge.js";

/** How many packages are listed at first, and how many more each "Show more" adds: the list can be a thousand long. */
export const PACKAGES_PAGE_SIZE = 100;

/** Every package installed on the server, filtered by a name and paged, with a badge on the ones the server itself depends on. */
export default function PackagesTable({ packages }: { packages: DiagnosticsVersions["packages"] }) {
    const [query, setQuery] = useState("");
    const [directOnly, setDirectOnly] = useState(false);
    const [limit, setLimit] = useState(PACKAGES_PAGE_SIZE);

    const matching = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return packages.filter(
            (item) => (!directOnly || item.direct) && (needle === "" || `${item.name} ${item.version}`.toLowerCase().includes(needle))
        );
    }, [packages, query, directOnly]);
    const shown = matching.slice(0, limit);

    return (
        <section aria-labelledby="diagnostics-packages-heading" className="rr-diag-section">
            <h2 id="diagnostics-packages-heading" className="rr-diag-section__title">
                Installed packages
            </h2>
            <div className="rr-diag-toolbar">
                <div className="rr-diag-toolbar__grow">
                    <input
                        type="search"
                        aria-label="Filter packages"
                        className="rr-input"
                        placeholder="Filter by name or version"
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setLimit(PACKAGES_PAGE_SIZE);
                        }}
                    />
                </div>
                <label className="rr-diag-check">
                    <input
                        type="checkbox"
                        checked={directOnly}
                        onChange={(event) => {
                            setDirectOnly(event.target.checked);
                            setLimit(PACKAGES_PAGE_SIZE);
                        }}
                    />
                    Direct dependencies only
                </label>
            </div>
            <p role="status" className="rr-diag-status rr-diag-status--block">
                {matching.length === packages.length
                    ? `${packages.length} packages`
                    : `${matching.length} of ${packages.length} packages match`}
            </p>
            {matching.length === 0 ? (
                <p className="rr-diag-muted">No packages match.</p>
            ) : (
                <div className="rr-diag-scroll">
                    <table className="rr-diag-table">
                        <thead>
                            <tr>
                                {["Package", "Version", ""].map((heading) => (
                                    <th key={heading}>{heading}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((item) => (
                                <tr key={`${item.name}@${item.version}`}>
                                    <td className="rr-diag-mono rr-diag-break">{item.name}</td>
                                    <td className="rr-diag-mono">{item.version}</td>
                                    <td>{item.direct && <Badge tone="info">direct</Badge>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {shown.length < matching.length && (
                <div className="rr-diag-toolbar rr-diag-toolbar--spaced">
                    <Button type="button" variant="secondary" onClick={() => setLimit(limit + PACKAGES_PAGE_SIZE)}>
                        Show more
                    </Button>
                    <span className="rr-diag-status">
                        Showing {shown.length} of {matching.length}
                    </span>
                </div>
            )}
        </section>
    );
}
