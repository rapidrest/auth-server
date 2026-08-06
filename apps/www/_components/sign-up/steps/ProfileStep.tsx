import React, { FormEvent } from "react";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";
import PasswordFieldset from "../../forms/PasswordFieldset.js";
import { isPasswordValid, PasswordCriterion } from "../../../_lib/passwordCriteria.js";

export interface ProfileStepProps {
    username: string;
    setUsername: (value: string) => void;
    givenName: string;
    setGivenName: (value: string) => void;
    familyName: string;
    setFamilyName: (value: string) => void;
    birthdate: string;
    setBirthdate: (value: string) => void;
    password: string;
    setPassword: (value: string) => void;
    confirmPassword: string;
    setConfirmPassword: (value: string) => void;
    passwordCriteria: PasswordCriterion[];
    loading: boolean;
    onSubmit: (e: FormEvent) => void;
}

export default function ProfileStep({
    username,
    setUsername,
    givenName,
    setGivenName,
    familyName,
    setFamilyName,
    birthdate,
    setBirthdate,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    passwordCriteria,
    loading,
    onSubmit,
}: ProfileStepProps) {
    const disabled =
        loading ||
        (password.length > 0 && !isPasswordValid(password, passwordCriteria)) ||
        (password.length > 0 && password !== confirmPassword);

    return (
        <form onSubmit={onSubmit}>
            <div className="rr-card__title">Tell us about yourself</div>
            <p className="rr-card__subtitle">
                A password is optional — you can add one, a passkey, or an authenticator app later.
            </p>
            <FormField label="Username (optional)" htmlFor="username">
                <input
                    id="username"
                    className="rr-input"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="A unique name you can sign in with"
                />
            </FormField>
            <FormField label="Given name" htmlFor="givenName">
                <input
                    id="givenName"
                    className="rr-input"
                    type="text"
                    autoComplete="given-name"
                    value={givenName}
                    onChange={(e) => setGivenName(e.target.value)}
                />
            </FormField>
            <FormField label="Family name" htmlFor="familyName">
                <input
                    id="familyName"
                    className="rr-input"
                    type="text"
                    autoComplete="family-name"
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                />
            </FormField>
            <FormField label="Birthdate" htmlFor="birthdate">
                <input
                    id="birthdate"
                    className="rr-input"
                    type="date"
                    autoComplete="bday"
                    value={birthdate}
                    onChange={(e) => setBirthdate(e.target.value)}
                />
            </FormField>
            <PasswordFieldset
                id="password"
                label="Password (optional)"
                confirmId="confirmPassword"
                confirmLabel="Confirm password"
                value={password}
                onChange={setPassword}
                confirmValue={confirmPassword}
                onConfirmChange={setConfirmPassword}
                criteria={passwordCriteria}
                emptyHint="Leave blank to add a password later, or start typing to set one now."
                showConfirmWhenEmpty={false}
            />
            <Button type="submit" loading={loading} disabled={disabled}>
                Create account
            </Button>
        </form>
    );
}
