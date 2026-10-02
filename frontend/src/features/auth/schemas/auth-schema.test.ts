import type { z } from "zod";
import {
  loginSchema,
  signupSchema,
  updateCredentialsSchema,
} from "./auth-schema";

// These run the real schemas, no mocks. They pin the rules the forms rely on:
// what is rejected, with which message, on which field. The backend DTOs are
// the real authority; the schemas only mirror them so a user sees the problem
// before a round trip. A schema loosened by accident would let a bad request
// reach the server, and these are what fail.

function issues(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
}

describe("loginSchema", () => {
  const valid = { email: "ada@example.com", password: "anything" };

  it("accepts a valid email and any non-empty password", () => {
    expect(loginSchema.safeParse(valid).success).toBe(true);
  });

  it("requires an email", () => {
    expect(issues(loginSchema, { ...valid, email: "" })).toContainEqual({
      path: "email",
      message: "Email is required",
    });
  });

  it("rejects a malformed email", () => {
    expect(
      issues(loginSchema, { ...valid, email: "not-an-email" }),
    ).toContainEqual({
      path: "email",
      message: "Enter a valid email address",
    });
  });

  it("requires a password", () => {
    expect(issues(loginSchema, { ...valid, password: "" })).toContainEqual({
      path: "password",
      message: "Password is required",
    });
  });
});

describe("signupSchema", () => {
  const valid = {
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    password: "long-enough-1",
    confirmPassword: "long-enough-1",
  };

  it("accepts a valid signup", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it("trims the full name and then requires at least 2 characters", () => {
    expect(
      issues(signupSchema, { ...valid, fullName: "  A  " }),
    ).toContainEqual({
      path: "fullName",
      message: "Full name must be at least 2 characters",
    });

    const padded = signupSchema.safeParse({ ...valid, fullName: "  Ab  " });
    expect(padded.success).toBe(true);
    expect(padded.success && padded.data.fullName).toBe("Ab");
  });

  it("rejects a malformed email", () => {
    expect(issues(signupSchema, { ...valid, email: "nope" })).toContainEqual({
      path: "email",
      message: "Enter a valid email address",
    });
  });

  it("requires a password of at least 8 characters (7 fails, 8 passes)", () => {
    expect(
      issues(signupSchema, {
        ...valid,
        password: "1234567",
        confirmPassword: "1234567",
      }),
    ).toContainEqual({
      path: "password",
      message: "Password must be at least 8 characters",
    });
    expect(
      signupSchema.safeParse({
        ...valid,
        password: "12345678",
        confirmPassword: "12345678",
      }).success,
    ).toBe(true);
  });

  it("requires the confirmation to be filled in", () => {
    expect(
      issues(signupSchema, { ...valid, confirmPassword: "" }),
    ).toContainEqual({
      path: "confirmPassword",
      message: "Please confirm your password",
    });
  });

  it("rejects a confirmation that does not match, reported on confirmPassword", () => {
    expect(
      issues(signupSchema, { ...valid, confirmPassword: "something-else-1" }),
    ).toContainEqual({
      path: "confirmPassword",
      message: "Passwords do not match",
    });
  });
});

describe("updateCredentialsSchema", () => {
  const blankExceptCurrent = {
    currentPassword: "current-pass",
    newFullName: "",
    newEmail: "",
    newPassword: "",
  };

  it("treats every blank new field as 'leave it as it is'", () => {
    expect(updateCredentialsSchema.safeParse(blankExceptCurrent).success).toBe(
      true,
    );
  });

  it("always requires the current password", () => {
    expect(
      issues(updateCredentialsSchema, {
        ...blankExceptCurrent,
        currentPassword: "",
      }),
    ).toContainEqual({
      path: "currentPassword",
      message: "Current password is required",
    });
  });

  it("treats a whitespace-only new name as blank, and rejects a 1-character one", () => {
    const blank = updateCredentialsSchema.safeParse({
      ...blankExceptCurrent,
      newFullName: "   ",
    });
    expect(blank.success).toBe(true);
    expect(blank.success && blank.data.newFullName).toBe("");

    expect(
      issues(updateCredentialsSchema, {
        ...blankExceptCurrent,
        newFullName: "A",
      }),
    ).toContainEqual({
      path: "newFullName",
      message: "Full name must be at least 2 characters",
    });
    expect(
      updateCredentialsSchema.safeParse({
        ...blankExceptCurrent,
        newFullName: "Ab",
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed new email, and trims a valid one", () => {
    expect(
      issues(updateCredentialsSchema, {
        ...blankExceptCurrent,
        newEmail: "bad",
      }),
    ).toContainEqual({
      path: "newEmail",
      message: "Enter a valid email address",
    });

    const padded = updateCredentialsSchema.safeParse({
      ...blankExceptCurrent,
      newEmail: " a@b.co ",
    });
    expect(padded.success).toBe(true);
    expect(padded.success && padded.data.newEmail).toBe("a@b.co");
  });

  it("requires a new password of at least 8 characters when one is given", () => {
    expect(
      issues(updateCredentialsSchema, {
        ...blankExceptCurrent,
        newPassword: "1234567",
      }),
    ).toContainEqual({
      path: "newPassword",
      message: "Password must be at least 8 characters",
    });
    expect(
      updateCredentialsSchema.safeParse({
        ...blankExceptCurrent,
        newPassword: "12345678",
      }).success,
    ).toBe(true);
  });
});
