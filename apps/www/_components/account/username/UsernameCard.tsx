import React, { Dispatch, FormEvent, SetStateAction, useMemo, useState } from "react";
import { Alias, ApiRequestError, createUsernameAlias, updateUsernameAlias } from "../../../_lib/api.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import ChangeUsernameModal from "./ChangeUsernameModal.js";

export interface UsernameCardProps {
    aliases: Alias[] | null;
    setAliases: Dispatch<SetStateAction<Alias[] | null>>;
}

export default function UsernameCard({ aliases, setAliases }: UsernameCardProps) {
    const usernameAlias = useMemo(() => aliases?.find((a) => a.type === "name"), [aliases]);
    const [usernameValue, setUsernameValue] = useState("");
    const [usernameSaving, setUsernameSaving] = useState(false);
    const [usernameError, setUsernameError] = useState<string | null>(null);
    const [usernameModalOpen, setUsernameModalOpen] = useState(false);

    async function handleAddUsername(e: FormEvent) {
        e.preventDefault();
        setUsernameError(null);
        setUsernameSaving(true);
        try {
            const created = await createUsernameAlias(usernameValue.trim());
            setAliases((prev) => [...(prev ?? []), created]);
            setUsernameValue("");
        } catch (err) {
            setUsernameError(err instanceof ApiRequestError ? err.message : "Could not save that username.");
        } finally {
            setUsernameSaving(false);
        }
    }

    function openChangeUsernameModal() {
        // Only reachable via the "Change" button, which only renders once `usernameAlias` exists.
        setUsernameValue(usernameAlias!.alias);
        setUsernameError(null);
        setUsernameModalOpen(true);
    }

    function closeChangeUsernameModal() {
        setUsernameModalOpen(false);
        setUsernameError(null);
        setUsernameValue("");
    }

    async function handleChangeUsername(e: FormEvent) {
        e.preventDefault();
        // Only reachable via the modal opened by openChangeUsernameModal(), which requires `usernameAlias`
        // — and therefore an already-loaded, non-null `aliases` — to exist in the first place.
        const oldAlias = usernameAlias!;
        setUsernameError(null);
        setUsernameSaving(true);
        try {
            const created = await updateUsernameAlias(oldAlias.uid, usernameValue.trim());
            setAliases((prev) => [...prev!.filter((a) => a.uid !== oldAlias.uid), created]);
            closeChangeUsernameModal();
        } catch (err) {
            setUsernameError(err instanceof ApiRequestError ? err.message : "Could not change your username.");
        } finally {
            setUsernameSaving(false);
        }
    }

    return (
        <div className="rr-card">
            <div className="rr-card__title">Username</div>
            <p className="rr-card__subtitle">A unique name you can use to sign in instead of an e-mail or phone.</p>
            {usernameError && !usernameModalOpen && <Alert>{usernameError}</Alert>}
            {usernameAlias ? (
                <div className="rr-list-row">
                    <div>{usernameAlias.alias}</div>
                    <Button variant="text" type="button" onClick={openChangeUsernameModal}>
                        Change
                    </Button>
                </div>
            ) : (
                <form onSubmit={handleAddUsername} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                    <input
                        className="rr-input"
                        type="text"
                        required
                        placeholder="username"
                        value={usernameValue}
                        onChange={(e) => setUsernameValue(e.target.value)}
                    />
                    <Button
                        variant="secondary"
                        type="submit"
                        loading={usernameSaving}
                        disabled={usernameSaving}
                        style={{ width: "auto" }}
                    >
                        Add
                    </Button>
                </form>
            )}

            <ChangeUsernameModal
                open={usernameModalOpen}
                onClose={closeChangeUsernameModal}
                value={usernameValue}
                setValue={setUsernameValue}
                error={usernameError}
                saving={usernameSaving}
                onSubmit={handleChangeUsername}
            />
        </div>
    );
}
