///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiChevronDown, FiLogOut, FiMonitor, FiMoon, FiSun } from "react-icons/fi";
import type { IconType } from "react-icons";
import type { ThemePreference } from "../../../lib/theme.js";
import { useTheme } from "../../../lib/useTheme.js";

export interface AvatarProps {
    name: string;
    /** Profile avatar image; falls back to `name`'s initial when absent or when the image fails to load. */
    src?: string;
    size?: number;
}

/** A circular avatar: the user's profile image when available, otherwise the first letter of their name. */
export function Avatar({ name, src, size = 32 }: AvatarProps) {
    const [failed, setFailed] = useState(false);
    const style = { width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.42}px` };

    if (src && !failed) {
        return (
            <img
                className="rr-avatar rr-avatar--image"
                style={style}
                src={src}
                alt=""
                onError={() => setFailed(true)}
            />
        );
    }
    return (
        <span className="rr-avatar" style={style} aria-hidden="true">
            {name.charAt(0).toUpperCase()}
        </span>
    );
}

const THEME_OPTIONS: { value: ThemePreference; label: string; Icon: IconType }[] = [
    { value: "system", label: "System", Icon: FiMonitor },
    { value: "light", label: "Light", Icon: FiSun },
    { value: "dark", label: "Dark", Icon: FiMoon },
];

export interface AvatarMenuProps {
    /** Shown in the dropdown header, and used for the avatar's initial and the trigger's accessible name. */
    displayName: string;
    avatarUrl?: string;
    onSignOut: () => void;
    /**
     * Where an "Exit Admin Console" item leads (a plain link, since it is an ordinary page route). The item is
     * only shown when this is given — i.e. by the admin console's shell, not by a menu on some other page.
     */
    exitHref?: string;
}

/**
 * The top bar's account button and its dropdown (the signed-in user's avatar/name, then an optional "Exit
 * Admin Console" link, a System/Light/Dark theme switcher and "Sign Out"). Picking a theme applies it to the whole page and
 * remembers the choice (see `useTheme()`); System follows the OS. The menu stays open, so the change is visible.
 * Follows the ARIA menu-button pattern: the trigger carries `aria-haspopup`/`aria-expanded`, opening
 * moves focus to the first item, and Escape (or a click anywhere outside) closes it again — Escape also
 * returns focus to the trigger so keyboard users aren't dropped at the top of the document.
 */
export default function AvatarMenu({ displayName, avatarUrl, onSignOut, exitHref }: AvatarMenuProps) {
    const [open, setOpen] = useState(false);
    const { preference, setPreference } = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        // All three refs are always attached while the menu is open — the panel (and its items) only render then,
        // and the theme toggle is always among them. The first item is a link or a button depending on the props.
        (panelRef.current as HTMLDivElement).querySelector<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')!.focus();

        function handlePointerDown(e: MouseEvent) {
            if (!(containerRef.current as HTMLDivElement).contains(e.target as Node)) {
                setOpen(false);
            }
        }

        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                setOpen(false);
                (triggerRef.current as HTMLButtonElement).focus();
            }
        }

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [open]);

    return (
        <div className="rr-avatar-menu" ref={containerRef}>
            <button
                ref={triggerRef}
                type="button"
                className="rr-avatar-menu__trigger"
                aria-label={`Account menu for ${displayName}`}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? "rr-avatar-menu-panel" : undefined}
                onClick={() => setOpen((value) => !value)}
            >
                <Avatar name={displayName} src={avatarUrl} />
                <FiChevronDown aria-hidden="true" />
            </button>

            {open && (
                <div
                    id="rr-avatar-menu-panel"
                    ref={panelRef}
                    className="rr-avatar-menu__panel"
                    role="menu"
                    aria-label="Account"
                >
                    <div className="rr-avatar-menu__identity">
                        <Avatar name={displayName} src={avatarUrl} size={40} />
                        <span className="rr-avatar-menu__name" title={displayName}>
                            {displayName}
                        </span>
                    </div>
                    <div className="rr-avatar-menu__divider" role="separator" />
                    {exitHref && (
                        <a role="menuitem" className="rr-avatar-menu__item" href={exitHref}>
                            <FiArrowLeft aria-hidden="true" />
                            Exit Admin Console
                        </a>
                    )}
                    <div className="rr-avatar-menu__theme">
                        <span id="rr-avatar-menu-theme-label">Theme</span>
                        <div className="rr-theme-switch" role="group" aria-labelledby="rr-avatar-menu-theme-label">
                            {THEME_OPTIONS.map(({ value, label, Icon }) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={preference === value}
                                    aria-label={label}
                                    title={label}
                                    className="rr-theme-switch__option"
                                    onClick={() => setPreference(value)}
                                >
                                    <Icon aria-hidden="true" />
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        type="button"
                        role="menuitem"
                        className="rr-avatar-menu__item"
                        onClick={() => {
                            setOpen(false);
                            onSignOut();
                        }}
                    >
                        <FiLogOut aria-hidden="true" />
                        Sign Out
                    </button>
                </div>
            )}
        </div>
    );
}
