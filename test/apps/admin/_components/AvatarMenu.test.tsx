// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
    it("starts closed, with menu-button ARIA attributes on the trigger", () => {
        render(<AvatarMenu displayName="Ada Lovelace" onSignOut={vi.fn()} />);
        const trigger = screen.getByRole("button", { name: "Account menu for Ada Lovelace" });
        expect(trigger).toHaveAttribute("aria-haspopup", "menu");
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(trigger).not.toHaveAttribute("aria-controls");
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("opens a panel with the avatar, the full display name, and a Sign Out item, focusing that item", async () => {
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
        expect(within(menu).getByRole("menuitem", { name: "Sign Out" })).toHaveFocus();
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
});
