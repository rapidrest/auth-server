import React, { useEffect, useState } from "react";
import { Alias, ApiRequestError } from "../shared/lib/api.js";
import { AdminUser, deleteUser, listAliasesForUsers, listUsers, searchUsers } from "../shared/lib/adminApi.js";
import AdminShell from "../shared/components/admin/layout/AdminShell.js";
import UserSearchBar, { DEFAULT_USER_FILTERS, UserFilters } from "../shared/components/admin/users/UserSearchBar.js";
import UserTable from "../shared/components/admin/users/UserTable.js";
import DeleteUserModal from "../shared/components/admin/users/DeleteUserModal.js";
import Alert from "../shared/components/feedback/Alert.js";
import Button from "../shared/components/buttons/Button.js";

const PAGE_SIZE = 25;

interface HomePageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
}

export default function UsersListPage({ userUid }: HomePageProps) {
    const [filters, setFilters] = useState<UserFilters>(DEFAULT_USER_FILTERS);
    const [page, setPage] = useState(0);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [aliasesByUid, setAliasesByUid] = useState<Record<string, Alias[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        const listParams = {
            page,
            limit: PAGE_SIZE,
            role: filters.role.trim() || undefined,
            verified: filters.verified === "any" ? undefined : filters.verified === "true",
        };
        const request = filters.query.trim() ? searchUsers(filters.query, listParams) : listUsers(listParams);
        request
            .then(async (result) => {
                setUsers(result);
                const aliases = await listAliasesForUsers(result.map((u) => u.uid));
                const byUid: Record<string, Alias[]> = {};
                for (const alias of aliases) {
                    (byUid[alias.userUid] ??= []).push(alias);
                }
                setAliasesByUid(byUid);
            })
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load accounts."))
            .finally(() => setLoading(false));
    }, [filters, page]);

    function handleSearch(next: UserFilters) {
        setPage(0);
        setFilters(next);
    }

    function openDeleteModal(user: AdminUser) {
        setDeleteError(null);
        setDeleteTarget(user);
    }

    async function handleConfirmDelete(purge: boolean) {
        // Only reachable via DeleteUserModal's own confirm button, which renders (and is therefore only
        // clickable) once `deleteTarget` is already set — DeleteUserModal returns null while `user` is null.
        setDeleting(true);
        setDeleteError(null);
        try {
            await deleteUser(deleteTarget!.uid, deleteTarget!.version, purge);
            setUsers((prev) => prev.filter((u) => u.uid !== deleteTarget!.uid));
            setDeleteTarget(null);
        } catch (err) {
            setDeleteError(err instanceof ApiRequestError ? err.message : "Could not delete this account.");
        } finally {
            setDeleting(false);
        }
    }

    const isSearch = !!filters.query.trim();
    const hasNextPage = !isSearch && users.length === PAGE_SIZE;

    return (
        <AdminShell userUid={userUid}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                <div className="rr-card__title" style={{ marginBottom: 0 }}>
                    Users
                </div>
                <a href="/admin/users/new">
                    <Button type="button" style={{ width: "auto" }}>
                        + New user
                    </Button>
                </a>
            </div>

            <UserSearchBar onSearch={handleSearch} searching={loading} />

            {error && <Alert>{error}</Alert>}

            {loading ? (
                <p className="rr-hint">Loading&hellip;</p>
            ) : (
                <UserTable users={users} aliasesByUid={aliasesByUid} onDelete={openDeleteModal} />
            )}

            {!isSearch && (
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "1rem" }}>
                    <Button
                        variant="secondary"
                        type="button"
                        style={{ width: "auto" }}
                        disabled={page === 0 || loading}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                        Previous
                    </Button>
                    <span className="rr-hint">Page {page + 1}</span>
                    <Button
                        variant="secondary"
                        type="button"
                        style={{ width: "auto" }}
                        disabled={!hasNextPage || loading}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        Next
                    </Button>
                </div>
            )}

            <DeleteUserModal
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                user={deleteTarget}
                onConfirm={handleConfirmDelete}
                deleting={deleting}
                error={deleteError}
            />
        </AdminShell>
    );
}
