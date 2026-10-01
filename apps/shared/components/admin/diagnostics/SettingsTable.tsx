///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useMemo, useState } from "react";
import Button from "../../buttons/Button.js";
import type { DiagnosticsSetting } from "./diagnosticsApi.js";

/** How many settings are listed at first, and how many more each "Show more" adds: an environment can be a hundred long. */
export const SETTINGS_PAGE_SIZE = 100;

/** What stands where the server withheld a value. Drawn here from `redacted`: the server never sends the value (or any text for it). */
export const HIDDEN_VALUE = "•••• (hidden)";

export interface SettingsTableProps {
    /** The section's heading, which also names its filter box and labels the section. */
    title: string;
    /** What the section lists, under the heading. */
    description: string;
    /** Also the prefix of the heading's element id. */
    id: string;
    settings: DiagnosticsSetting[];
}

/**
 * A filterable, paged list of settings (name and value). A value the server withheld is shown as "•••• (hidden)", never as
 * anything it could have held. The filter matches names, and the values that are shown: a hidden value can't be searched for.
 */
export default function SettingsTable({ title, description, id, settings }: SettingsTableProps) {
    const [query, setQuery] = useState("");
    const [limit, setLimit] = useState(SETTINGS_PAGE_SIZE);

    const matching = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return settings.filter((item) => needle === "" || `${item.name} ${item.redacted ? "" : (item.value ?? "")}`.toLowerCase().includes(needle));
    }, [settings, query]);
    const shown = matching.slice(0, limit);
    const hiddenCount = settings.filter((item) => item.redacted).length;

    return (
        <section aria-labelledby={`${id}-heading`} className="rr-diag-section">
            <h2 id={`${id}-heading`} className="rr-diag-section__title">
                {title}
            </h2>
            <p className="rr-diag-muted">{description}</p>
            <div className="rr-diag-toolbar">
                <div className="rr-diag-toolbar__grow">
                    <input
                        type="search"
                        aria-label={`Filter ${title.toLowerCase()}`}
                        className="rr-input"
                        placeholder="Filter by name or value"
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setLimit(SETTINGS_PAGE_SIZE);
                        }}
                    />
                </div>
            </div>
            <p role="status" className="rr-diag-status rr-diag-status--block">
                {(matching.length === settings.length ? `${settings.length} settings` : `${matching.length} of ${settings.length} settings match`) +
                    (hiddenCount > 0 ? `, ${hiddenCount} with a hidden value` : "")}
            </p>
            {matching.length === 0 ? (
                <p className="rr-diag-muted">{settings.length === 0 ? "Nothing is set." : "No settings match."}</p>
            ) : (
                <div className="rr-diag-scroll">
                    <table className="rr-diag-table">
                        <thead>
                            <tr>
                                {["Name", "Value"].map((heading) => (
                                    <th key={heading}>{heading}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((item) => (
                                <tr key={item.name}>
                                    <td className="rr-diag-mono rr-diag-break">{item.name}</td>
                                    <td className="rr-diag-mono rr-diag-break">
                                        {item.redacted ? <span className="rr-diag-muted">{HIDDEN_VALUE}</span> : item.value}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {shown.length < matching.length && (
                <div className="rr-diag-toolbar rr-diag-toolbar--spaced">
                    <Button type="button" variant="secondary" onClick={() => setLimit(limit + SETTINGS_PAGE_SIZE)}>
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
