import { describe, expect, it } from "vitest";
import {
  isRole,
  permissionsFor,
  roleChangeViolation,
  sanctionViolation
} from "./admin.js";

describe("admin permissions", () => {
  it("keeps feature and role management exclusive to superusers", () => {
    expect(permissionsFor("moderator")).toContain("reports:review");
    expect(permissionsFor("moderator")).not.toContain("features:write");
    expect(permissionsFor("admin")).toContain("sanctions:write");
    expect(permissionsFor("admin")).not.toContain("users:roles");
    expect(permissionsFor("superuser")).toContain("features:write");
    expect(permissionsFor("superuser")).toContain("users:roles");
  });

  it("accepts only supported persisted roles", () => {
    for (const role of ["user", "moderator", "admin", "superuser"]) {
      expect(isRole(role)).toBe(true);
    }
    expect(isRole("owner")).toBe(false);
    expect(isRole("")).toBe(false);
  });

  it("protects self, guests and the last superuser during role changes", () => {
    expect(roleChangeViolation({
      actorId: "owner",
      targetId: "owner",
      targetEmail: "owner@example.com",
      targetRole: "superuser",
      targetIsGuest: false,
      requestedRole: "admin",
      confirmEmail: "owner@example.com",
      superuserCount: 2
    })).toBe("cannot_demote_self");

    expect(roleChangeViolation({
      actorId: "owner",
      targetId: "guest",
      targetEmail: "guest@example.com",
      targetRole: "user",
      targetIsGuest: true,
      requestedRole: "moderator",
      superuserCount: 2
    })).toBe("guest_role_forbidden");

    expect(roleChangeViolation({
      actorId: "owner",
      targetId: "other-owner",
      targetEmail: "other@example.com",
      targetRole: "superuser",
      targetIsGuest: false,
      requestedRole: "admin",
      confirmEmail: "other@example.com",
      superuserCount: 1
    })).toBe("last_superuser");
  });

  it("requires authority and confirmation to sanction a superuser", () => {
    const target = {
      actorId: "admin",
      targetId: "owner",
      targetEmail: "owner@example.com",
      targetRole: "superuser" as const,
      superuserCount: 2
    };
    expect(sanctionViolation({ ...target, actorRole: "admin" })).toBe("forbidden_target");
    expect(sanctionViolation({ ...target, actorRole: "superuser" })).toBe("confirmation_required");
    expect(sanctionViolation({
      ...target,
      actorRole: "superuser",
      confirmEmail: "owner@example.com"
    })).toBeNull();
  });
});
