// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AvatarMenu, { Avatar } from "../../../../apps/shared/components/admin/layout/AvatarMenu.js";

describe("Avatar", () => {
    it("renders the name's uppercased initial when there is no image", () => {
        const { container } = render(<Avatar name="ada" />);
        expect(container.textContent).toBe("A");
        expect(container.querySelector("img")).toBeNull();
    });

    it("renders the image when given one, falling back to the initial if it fails to load", () => {
        const { container } = render(<Avatar name="Ada" src="https://example.com/me.png" size={40} />);
        const img = container.querySelector("img") as HTMLImageElement;
        expect(img).toHaveAttribute("src", "https://example.com/me.png");
        expect(img.style.width).toBe("40px");

        fireEvent.error(img);
        expect(container.querySelector("img")).toBeNull();
        expect(container.textContent).toBe("A");
    });
});

describe("AvatarMenu", () => {
    // The theme toggle reads/writes localStorage and <html data-theme>, which outlive a single test.
    beforeEach(() => {
        window.localStorage.clear();
        delete document.documentElement.dataset.theme;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("starts closed, with menu-button ARIA attributes on the trigger", () => {
        render(<AvatarMenu displayName="Ada Lovelace" onSignOut={vi.fn()} />);
        const trigger = screen.getByRole("button", { name: "Account menu for Ada Lovelace" });
        expect(trigger).toHaveAttribute("aria-haspopup", "menu");
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(trigger).not.toHaveAttribute("aria-controls");
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("opens a panel with the avatar, the full display name, a theme toggle and a Sign Out item, focusing the first item", async () => {
        const user = userEvent.setup();
        const longName = "Augusta Ada King, Countess of Lovelace and Honorary Member of Many Societies";
        render(<AvatarMenu displayName={longName} onSignOut={vi.fn()} />);

        const trigger = screen.getByRole("button", { name: `Account menu for ${longName}` });
        await user.click(trigger);

        const menu = screen.getByRole("menu");
        expect(trigger).toHaveAttribute("aria-expanded", "true");
        expect(trigger).toHaveAttribute("aria-controls", menu.id);
        // Truncated visually via CSS; the full name stays available as a tooltip.
        expect(within(menu).getByText(longName)).toHaveAttribute("title", longName);
        expect(within(menu).getByRole("menuitem", { name: "Sign Out" })).toBeInTheDocument();
        expect(within(menu).getByRole("menuitem", { name: "Dark theme" })).toHaveFocus();
        // The Exit Admin Console item is only offered when the shell says where it leads.
        expect(within(menu).queryByRole("menuitem", { name: "Exit Admin Console" })).not.toBeInTheDocument();
        expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Dark theme", "Sign Out"]);
    });

    it("toggles closed when the trigger is clicked again", async () => {
        const user = userEvent.setup();
        render(<AvatarMenu displayName="Ada" onSignOut={vi.fn()} />);
        const trigger = screen.getByRole("button", { name: "Account menu for Ada" });

        await user.click(trigger);
        expect(screen.getByRole("menu")).toBeInTheDocument();
        await user.click(trigger);
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("closes on Escape and returns focus to the trigger, ignoring other keys", async () => {
        const user = userEvent.setup();
        render(<AvatarMenu displayName="Ada" onSignOut={vi.fn()} />);
        const trigger = screen.getByRole("button", { name: "Account menu for Ada" });

        await user.click(trigger);
        await user.keyboard("a");
        expect(screen.getByRole("menu")).toBeInTheDocument();

        await user.keyboard("{Escape}");
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
        expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("closes on a click outside, but not on a click inside the panel", async () => {
        const user = userEvent.setup();
        render(
            <div>
                <p>elsewhere</p>
                <AvatarMenu displayName="Ada" onSignOut={vi.fn()} />
            </div>,
        );

        await user.click(screen.getByRole("button", { name: "Account menu for Ada" }));
        await user.click(within(screen.getByRole("menu")).getByText("Ada"));
        expect(screen.getByRole("menu")).toBeInTheDocument();

        await user.click(screen.getByText("elsewhere"));
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("is keyboard operable: Enter opens it, and Sign Out closes it and calls onSignOut", async () => {
        const user = userEvent.setup();
        const onSignOut = vi.fn();
        render(<AvatarMenu displayName="Ada" onSignOut={onSignOut} />);

        await user.tab();
        expect(screen.getByRole("button", { name: "Account menu for Ada" })).toHaveFocus();
        await user.keyboard("{Enter}");
        expect(screen.getByRole("menuitem", { name: "Dark theme" })).toHaveFocus();
        await user.tab();
        expect(screen.getByRole("menuitem", { name: "Sign Out" })).toHaveFocus();
        await user.keyboard("{Enter}");

        expect(onSignOut).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("shows the avatar image in both the trigger and the panel when one is given", async () => {
        const user = userEvent.setup();
        render(<AvatarMenu displayName="Ada" avatarUrl="https://example.com/me.png" onSignOut={vi.fn()} />);

        await user.click(screen.getByRole("button", { name: "Account menu for Ada" }));
        expect(document.querySelectorAll('img[src="https://example.com/me.png"]')).toHaveLength(2);
    });

    it("offers an Exit Admin Console link to exitHref, first in the menu and focused on open", async () => {
        const user = userEvent.setup();
        render(<AvatarMenu displayName="Ada" onSignOut={vi.fn()} exitHref="/" />);

        await user.click(screen.getByRole("button", { name: "Account menu for Ada" }));

        const exit = screen.getByRole("menuitem", { name: "Exit Admin Console" });
        expect(exit.tagName).toBe("A");
        expect(exit).toHaveAttribute("href", "/");
        expect(exit).toHaveFocus();
        expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
            "Exit Admin Console",
            "Dark theme",
            "Sign Out",
        ]);
    });

    describe("theme toggle", () => {
        it("switches to the dark theme, applying and remembering it, and relabels itself to offer the light one", async () => {
            vi.stubGlobal("matchMedia", () => ({ matches: false }));
            const user = userEvent.setup();
            render(<AvatarMenu displayName="Ada" onSignOut={vi.fn()} />);
            await user.click(screen.getByRole("button", { name: "Account menu for Ada" }));

            await user.click(screen.getByRole("menuitem", { name: "Dark theme" }));

            expect(document.documentElement.dataset.theme).toBe("dark");
            expect(window.localStorage.getItem("rr-theme")).toBe("dark");
            // The menu stays open and the (relabelled) item keeps focus, so it can be flipped straight back.
            const item = screen.getByRole("menuitem", { name: "Light theme" });
            expect(item).toHaveFocus();

            await user.click(item);
            expect(document.documentElement.dataset.theme).toBe("light");
            expect(window.localStorage.getItem("rr-theme")).toBe("light");
            expect(screen.getByRole("menuitem", { name: "Dark theme" })).toBeInTheDocument();
        });

        it("starts from the OS preference when nothing is stored", async () => {
            vi.stubGlobal("matchMedia", () => ({ matches: true }));
            const user = userEvent.setup();
            render(<AvatarMenu displayName="Ada" onSignOut={vi.fn()} />);
            await user.click(screen.getByRole("button", { name: "Account menu for Ada" }));

            expect(screen.getByRole("menuitem", { name: "Light theme" })).toBeInTheDocument();
        });

        it("starts from the stored choice in preference to the OS preference", async () => {
            vi.stubGlobal("matchMedia", () => ({ matches: true }));
            window.localStorage.setItem("rr-theme", "light");
            const user = userEvent.setup();
            render(<AvatarMenu displayName="Ada" onSignOut={vi.fn()} />);
            await user.click(screen.getByRole("button", { name: "Account menu for Ada" }));

            expect(screen.getByRole("menuitem", { name: "Dark theme" })).toBeInTheDocument();
        });
    });
});
