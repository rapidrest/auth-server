///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import {
    MessageTemplateDetail,
    MessageTemplateInput,
    previewMessageTemplate,
    RenderedMessage,
    resetMessageTemplate,
    updateMessageTemplate,
} from "../../../lib/messagingApi.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import FormField from "../../forms/FormField.js";
import MessagePreview from "./MessagePreview.js";

export interface TemplateEditorProps {
    template: MessageTemplateDetail;
    /** Called with the template as the server now has it, after a save or a reset. */
    onChanged: (template: MessageTemplateDetail) => void;
}

interface Values {
    enabled: boolean;
    subject: string;
    text: string;
    html: string;
    sms: string;
    whatsapp: string;
    whatsappTemplateName: string;
    whatsappTemplateLanguage: string;
    whatsappTemplateParameters: string;
}

/** The parts of a message with content of their own, as the server names them; `enabled` is a switch, not content. */
const CONTENT_FIELDS = [
    "subject",
    "text",
    "html",
    "sms",
    "whatsapp",
    "whatsappTemplateName",
    "whatsappTemplateLanguage",
    "whatsappTemplateParameters",
] as const;

function valuesOf(template: MessageTemplateDetail): Values {
    return {
        enabled: template.enabled,
        subject: template.subject ?? "",
        text: template.text ?? "",
        html: template.html ?? "",
        sms: template.sms ?? "",
        whatsapp: template.whatsapp ?? "",
        whatsappTemplateName: template.whatsappTemplateName ?? "",
        whatsappTemplateLanguage: template.whatsappTemplateLanguage ?? "",
        whatsappTemplateParameters: template.whatsappTemplateParameters ?? "",
    };
}

/**
 * What to send for the editor's current values: `null` for any part that's the same as the default, so it stays
 * "not edited" and keeps following the default if that ever changes, and the value itself for a part that differs.
 * A default the template doesn't have at all is the empty string, so an untouched empty box isn't an edit.
 */
function inputFor(template: MessageTemplateDetail, values: Values): MessageTemplateInput {
    const input: MessageTemplateInput = { enabled: values.enabled === template.defaults.enabled ? null : values.enabled };
    for (const field of CONTENT_FIELDS) {
        input[field] = values[field] === (template.defaults[field] ?? "") ? null : values[field];
    }
    return input;
}

interface FieldProps {
    id: string;
    label: string;
    hint: string;
    value: string;
    /** What the part is with no edits, to revert to. */
    defaultValue: string | undefined;
    rows?: number;
    /** A one-line input rather than a text area. */
    single?: boolean;
    placeholder?: string;
    onChange: (value: string) => void;
}

function Field({ id, label, hint, value, defaultValue, rows = 6, single, placeholder, onChange }: FieldProps) {
    const modified = value !== (defaultValue ?? "");
    return (
        <FormField label={label} htmlFor={id}>
            {single ? (
                <input
                    id={id}
                    className="rr-input"
                    type="text"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
            ) : (
                <textarea
                    id={id}
                    className="rr-input"
                    rows={rows}
                    placeholder={placeholder}
                    spellCheck={false}
                    style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
            )}
            <p className="rr-hint">
                {hint}
                {modified && (
                    <>
                        {" "}
                        <Button
                            variant="text"
                            type="button"
                            aria-label={`Revert ${label.toLowerCase()} to the default`}
                            onClick={() => onChange(defaultValue ?? "")}
                        >
                            Revert to default
                        </Button>
                    </>
                )}
            </p>
        </FormField>
    );
}

/**
 * Edits one message: whether it's sent, its e-mail subject/plain-text/HTML bodies, its SMS, and its WhatsApp message
 * (free-form text, or an approved WhatsApp message template). Every part is shown
 * as it's currently sent — the default, until someone changes it — and can be reverted to the default on its own.
 * "Preview" renders the draft exactly as a send would, with the real site branding, before anything is saved.
 */
export default function TemplateEditor({ template, onChanged }: TemplateEditorProps) {
    const [values, setValues] = useState<Values>(() => valuesOf(template));
    const [rendered, setRendered] = useState<RenderedMessage | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Follow the template as the server has it: after a save, or a reset, that's the source of truth.
    useEffect(() => {
        setValues(valuesOf(template));
    }, [template]);

    function edit(changes: Partial<Values>) {
        setValues((prev) => ({ ...prev, ...changes }));
        // A preview or a "Saved." describes what was on screen before this change.
        setRendered(null);
        setSaved(false);
    }

    async function handlePreview() {
        setError(null);
        setPreviewing(true);
        try {
            setRendered(await previewMessageTemplate(template.name, inputFor(template, values)));
        } catch (err) {
            setRendered(null);
            setError(err instanceof ApiRequestError ? err.message : "Could not preview this message.");
        } finally {
            setPreviewing(false);
        }
    }

    async function handleSave() {
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            onChanged(await updateMessageTemplate(template.name, inputFor(template, values)));
            setSaved(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save this message.");
        } finally {
            setSaving(false);
        }
    }

    async function handleReset() {
        if (!window.confirm("Discard every edit to this message and go back to the default?")) {
            return;
        }
        setError(null);
        setSaved(false);
        setResetting(true);
        try {
            const reset = await resetMessageTemplate(template.name);
            setRendered(null);
            onChanged(reset);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not reset this message.");
        } finally {
            setResetting(false);
        }
    }

    const busy = previewing || saving || resetting;

    return (
        <>
            <div className="rr-card">
                <div className="rr-card__title">{template.title || template.name}</div>
                {template.description && <p className="rr-card__subtitle">{template.description}</p>}
                {error && <Alert>{error}</Alert>}

                <div className="rr-field">
                    <label htmlFor="messageEnabled" className="rr-switch">
                        <input
                            id="messageEnabled"
                            type="checkbox"
                            role="switch"
                            className="rr-switch__input"
                            checked={values.enabled}
                            onChange={(e) => edit({ enabled: e.target.checked })}
                        />
                        <span className="rr-switch__track" aria-hidden="true" />
                        Send this message
                    </label>
                    <p className="rr-hint">
                        When off, nothing is sent for this message at all, by e-mail or text. People who are waiting for
                        the code won&rsquo;t receive one.
                    </p>
                </div>
            </div>

            <div className="rr-card">
                <div className="rr-card__title">E-mail</div>
                <Field
                    id="messageSubject"
                    label="Subject"
                    single
                    hint="Leave empty to stop sending this message by e-mail."
                    value={values.subject}
                    defaultValue={template.defaults.subject}
                    onChange={(subject) => edit({ subject })}
                />
                <Field
                    id="messageText"
                    label="Plain-text body"
                    rows={8}
                    hint="Shown by mail apps that don't display HTML, and alongside the HTML version."
                    value={values.text}
                    defaultValue={template.defaults.text}
                    onChange={(text) => edit({ text })}
                />
                <Field
                    id="messageHtml"
                    label="HTML body"
                    rows={14}
                    hint="Mail apps show this instead of the plain-text body. Leave empty to send plain text only."
                    value={values.html}
                    defaultValue={template.defaults.html}
                    onChange={(html) => edit({ html })}
                />
            </div>

            <div className="rr-card">
                <div className="rr-card__title">Text message</div>
                <Field
                    id="messageSms"
                    label="Message"
                    rows={3}
                    hint="Leave empty to stop sending this message by text."
                    value={values.sms}
                    defaultValue={template.defaults.sms}
                    onChange={(sms) => edit({ sms })}
                />
            </div>

            <div className="rr-card">
                <div className="rr-card__title">WhatsApp</div>
                <Field
                    id="messageWhatsapp"
                    label="WhatsApp message"
                    rows={3}
                    hint="Free-form text. WhatsApp only delivers it to someone who has messaged you in the last 24 hours, so it won't reach most people waiting for a code. Leave empty, with no approved template below, to stop sending this message on WhatsApp."
                    value={values.whatsapp}
                    defaultValue={template.defaults.whatsapp}
                    onChange={(whatsapp) => edit({ whatsapp })}
                />

                <div role="group" aria-labelledby="whatsappTemplateHeading" style={{ marginTop: "1.5rem" }}>
                    <div id="whatsappTemplateHeading" style={{ fontWeight: 600 }}>
                        Approved WhatsApp template
                    </div>
                    <p className="rr-hint">
                        A message template approved in Meta&rsquo;s WhatsApp Manager can be sent to anyone, whenever they last
                        wrote. When it has a name, it&rsquo;s sent instead of the WhatsApp message above. Leave the name empty
                        to send that message.
                    </p>
                    <Field
                        id="messageWhatsappTemplateName"
                        label="Template name"
                        single
                        placeholder="login_code"
                        hint="The name it was approved under, exactly as it appears in the WhatsApp Manager."
                        value={values.whatsappTemplateName}
                        defaultValue={template.defaults.whatsappTemplateName}
                        onChange={(whatsappTemplateName) => edit({ whatsappTemplateName })}
                    />
                    <Field
                        id="messageWhatsappTemplateLanguage"
                        label="Language code"
                        single
                        placeholder="en_US"
                        hint="The language it was approved in, like en_US. Needed whenever there's a template name."
                        value={values.whatsappTemplateLanguage}
                        defaultValue={template.defaults.whatsappTemplateLanguage}
                        onChange={(whatsappTemplateLanguage) => edit({ whatsappTemplateLanguage })}
                    />
                    <Field
                        id="messageWhatsappTemplateParameters"
                        label="Parameters"
                        rows={3}
                        placeholder="{{totp}}"
                        hint="One per line, filling the template's {{1}}, {{2}}… in order. Each can use variables, like {{totp}}. Blank lines are ignored."
                        value={values.whatsappTemplateParameters}
                        defaultValue={template.defaults.whatsappTemplateParameters}
                        onChange={(whatsappTemplateParameters) => edit({ whatsappTemplateParameters })}
                    />
                </div>
            </div>

            <div className="rr-card">
                <div className="rr-card__title">Variables</div>
                <p className="rr-card__subtitle">
                    Write a variable between double braces, like <code>{"{{totp}}"}</code>. In the subject, plain-text body,
                    text message and WhatsApp message, write the brand ones with three — <code>{"{{{brand.name}}}"}</code> — so a name like
                    &ldquo;Tom &amp; Jerry&rdquo; isn&rsquo;t turned into HTML. The site branding is set under Settings.
                </p>
                <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                    {template.variables.map((variable) => (
                        <li key={variable.name}>
                            <code>{variable.name}</code> &mdash; {variable.description}
                        </li>
                    ))}
                </ul>
            </div>

            <div className="rr-card">
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
                    <Button type="button" onClick={handleSave} loading={saving} disabled={busy} style={{ width: "auto" }}>
                        Save
                    </Button>
                    <Button
                        variant="secondary"
                        type="button"
                        onClick={handlePreview}
                        loading={previewing}
                        disabled={busy}
                        style={{ width: "auto" }}
                    >
                        Preview
                    </Button>
                    {template.customized && (
                        <Button
                            variant="secondary"
                            type="button"
                            onClick={handleReset}
                            loading={resetting}
                            disabled={busy}
                            style={{ width: "auto" }}
                        >
                            Reset to default
                        </Button>
                    )}
                    {saved && <span className="rr-hint">Saved.</span>}
                </div>
                {rendered && (
                    <div style={{ marginTop: "1.5rem" }}>
                        <MessagePreview rendered={rendered} />
                    </div>
                )}
            </div>
        </>
    );
}
