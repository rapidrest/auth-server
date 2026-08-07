// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RoleScopeEditor from "../../../../apps/shared/components/admin/users/RoleScopeEditor.js";

function Harness({ initial = [] as string[] }) {
    const [values, setValues] = useState<string[]>(initial);
    return <RoleScopeEditor id="roles" label="Roles" values={values} onChange={setValues} placeholder="e.g. admin" />;
}

describe("RoleScopeEditor", () => {
    it("renders no chips when there are no values", () => {
        render(<Harness />);
        expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
    });

    it("renders a chip per value with a remove button", () => {
        render(<Harness initial={["admin", "editor"]} />);
        expect(screen.getByText("admin")).toBeInTheDocument();
        expect(screen.getByText("editor")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Remove admin" })).toBeInTheDocument();
    });

    it("adds a trimmed value via the Add button and clears the draft", async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.type(screen.getByPlaceholderText("e.g. admin"), "  admin  ");
        await user.click(screen.getByRole("button", { name: "Add" }));
        expect(screen.getByText("admin")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("e.g. admin")).toHaveValue("");
    });

    it("adds a value on Enter and prevents the default form submission", async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.type(screen.getByPlaceholderText("e.g. admin"), "admin{Enter}");
        expect(screen.getByText("admin")).toBeInTheDocument();
    });

    it("adds a value on comma", async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.type(screen.getByPlaceholderText("e.g. admin"), "admin,");
        expect(screen.getByText("admin")).toBeInTheDocument();
    });

    it("does not add a blank or duplicate value", async () => {
        const user = userEvent.setup();
        render(<Harness initial={["admin"]} />);
        await user.click(screen.getByRole("button", { name: "Add" }));
        await user.type(screen.getByPlaceholderText("e.g. admin"), "admin{Enter}");
        expect(screen.getAllByText("admin")).toHaveLength(1);
    });

    it("removes a value when its chip's remove button is clicked", async () => {
        const user = userEvent.setup();
        render(<Harness initial={["admin", "editor"]} />);
        await user.click(screen.getByRole("button", { name: "Remove admin" }));
        expect(screen.queryByText("admin")).not.toBeInTheDocument();
        expect(screen.getByText("editor")).toBeInTheDocument();
    });

    it("hides the input and remove buttons when disabled", () => {
        render(<RoleScopeEditor id="roles" label="Roles" values={["admin"]} onChange={vi.fn()} disabled />);
        expect(screen.getByText("admin")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Remove admin" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
    });
});
