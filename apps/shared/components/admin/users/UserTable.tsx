import React from "react";
import { Alias } from "../../../lib/api.js";
import { AdminUser } from "../../../lib/adminApi.js";
import Button from "../../buttons/Button.js";
import UserStatusBadge from "./UserStatusBadge.js";

export interface UserTableProps {
    users: AdminUser[];
    /** This account's registered identifiers (email/phone/username/oauth), keyed by `uid`. */
    aliasesByUid: Record<string, Alias[]>;
    onDelete: (user: AdminUser) => void;
}

function formatDate(iso: string | undefined): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
        return iso;
    }
}

function ChipList({ values }: { values: string[] }) {
    if (values.length === 0) {
        return <span className="rr-hint">&mdash;</span>;
    }
    return (
        <div className="rr-chips" style={{ marginBottom: 0 }}>
            {values.map((value) => (
                <span className="rr-chip" key={value}>
                    {value}
                </span>
            ))}
        </div>
    );
}

export default function UserTable({ users, aliasesByUid, onDelete }: UserTableProps) {
    if (users.length === 0) {
        return <p className="rr-hint">No accounts found.</p>;
    }

    return (
        <div style={{ overflowX: "auto" }}>
            <table className="rr-table">
                <thead>
                    <tr>
                        <th>Aliases</th>
                        <th>Roles</th>
                        <th>Scopes</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {users.map((user) => (
                        <tr key={user.uid}>
                            <td>
                                <ChipList values={(aliasesByUid[user.uid] ?? []).map((a) => a.alias)} />
                            </td>
                            <td>
                                <ChipList values={user.roles ?? []} />
                            </td>
                            <td>
                                <ChipList values={user.scopes ?? []} />
                            </td>
                            <td>
                                <UserStatusBadge verified={user.verified} />
                            </td>
                            <td>{formatDate(user.dateCreated)}</td>
                            <td style={{ whiteSpace: "nowrap" }}>
                                <a href={`/admin/users/detail?uid=${encodeURIComponent(user.uid)}`}>View</a>
                                <Button variant="text" type="button" onClick={() => onDelete(user)} style={{ marginLeft: "0.75rem" }}>
                                    Delete
                                </Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
