import React, { FormEvent, useState } from "react";
import Button from "../../buttons/Button.js";

export interface UserFilters {
    query: string;
    role: string;
    verified: "any" | "true" | "false";
}

export const DEFAULT_USER_FILTERS: UserFilters = { query: "", role: "", verified: "any" };

export interface UserSearchBarProps {
    onSearch: (filters: UserFilters) => void;
    searching?: boolean;
}

/** Free-text query (matched against uid and identifiers) plus role/verified filters for the Users list. */
export default function UserSearchBar({ onSearch, searching }: UserSearchBarProps) {
    const [filters, setFilters] = useState<UserFilters>(DEFAULT_USER_FILTERS);

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        onSearch(filters);
    }

    return (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1rem" }}>
            <div className="rr-field" style={{ flex: "2 1 240px", marginBottom: 0 }}>
                <label htmlFor="userSearchQuery">Search</label>
                <input
                    id="userSearchQuery"
                    className="rr-input"
                    type="text"
                    placeholder="uid, email, phone, or username"
                    value={filters.query}
                    onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                />
            </div>
            <div className="rr-field" style={{ flex: "1 1 160px", marginBottom: 0 }}>
                <label htmlFor="userSearchRole">Role</label>
                <input
                    id="userSearchRole"
                    className="rr-input"
                    type="text"
                    placeholder="e.g. admin"
                    value={filters.role}
                    onChange={(e) => setFilters({ ...filters, role: e.target.value })}
                />
            </div>
            <div className="rr-field" style={{ flex: "1 1 140px", marginBottom: 0 }}>
                <label htmlFor="userSearchVerified">Status</label>
                <select
                    id="userSearchVerified"
                    className="rr-input"
                    value={filters.verified}
                    onChange={(e) => setFilters({ ...filters, verified: e.target.value as UserFilters["verified"] })}
                >
                    <option value="any">Any</option>
                    <option value="true">Verified</option>
                    <option value="false">Unverified</option>
                </select>
            </div>
            <Button type="submit" variant="secondary" style={{ width: "auto" }} loading={searching} disabled={searching}>
                Search
            </Button>
        </form>
    );
}
