///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { classifyContainer, imageBasename, imageDigest, imageTag } from "../../src/diagnostics/components.js";

describe("classifyContainer", () => {
    it.each([
        ["mongo", "docker.io/library/mongo:8", "mongodb"],
        ["postgres", "docker.io/library/postgres:17", "postgresql"],
        ["mongodb", "docker.io/bitnami/mongodb:8.0", "mongodb"],
        ["postgresql", "docker.io/bitnami/postgresql:17", "postgresql"],
        ["redis", "docker.io/bitnami/redis:8", "redis"],
        ["postgresql-repmgr", "docker.io/bitnami/postgresql-repmgr:17", "postgresql"],
        ["valkey", "docker.io/valkey/valkey:8", "redis"],
    ])("%s is %s by its name", (name, image, expected) => {
        expect(classifyContainer(name, image)).toBe(expected);
    });

    it("falls back to the image name", () => {
        expect(classifyContainer("db", "registry.local:5000/bitnami/mongodb:8@sha256:abc")).toBe("mongodb");
        expect(classifyContainer("cache", "docker.io/valkey/valkey:8")).toBe("redis");
        expect(classifyContainer("db", "docker.io/library/postgres:17")).toBe("postgresql");
    });

    it("ignores sidecars and unrelated containers", () => {
        expect(classifyContainer("metrics", "bitnami/redis-exporter:1")).toBeUndefined();
        expect(classifyContainer("cache", "bitnami/redis-exporter:1")).toBeUndefined();
        expect(classifyContainer("certificate-reloader", "busybox")).toBeUndefined();
        expect(classifyContainer("auth-server", "ghcr.io/rapidrest/auth-server:1")).toBeUndefined();
    });
});

describe("image helpers", () => {
    it("takes the last path segment without tag or digest", () => {
        expect(imageBasename("docker.io/bitnami/postgresql:17")).toBe("postgresql");
        expect(imageBasename("localhost:5000/foo@sha256:abc")).toBe("foo");
    });

    it("finds the tag, ignoring a registry port", () => {
        expect(imageTag("docker.io/bitnami/mongodb:8.0.4")).toBe("8.0.4");
        expect(imageTag("localhost:5000/foo")).toBeUndefined();
        expect(imageTag("localhost:5000/foo:2@sha256:abc")).toBe("2");
    });

    it("finds a digest in an imageID", () => {
        const digest = `sha256:${"a".repeat(64)}`;
        expect(imageDigest(`docker.io/bitnami/redis@${digest}`)).toBe(digest);
        expect(imageDigest(digest)).toBe(digest);
        expect(imageDigest("nonsense")).toBeUndefined();
        expect(imageDigest(undefined)).toBeUndefined();
    });
});
