import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters"),
    email: z
      .string()
      .min(1, "Email is required")
      .email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignupFormValues = z.infer<typeof signupSchema>;

// Every "new" field is optional: a blank one means "leave that as it is".
// The rules mirror the backend's UpdateCredentialsDto (name >= 2, valid
// email, password >= 8); only the current password is always required.
export const updateCredentialsSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newFullName: z
    .string()
    .trim()
    .refine((v) => v === "" || v.length >= 2, {
      message: "Full name must be at least 2 characters",
    }),
  newEmail: z
    .string()
    .trim()
    .refine((v) => v === "" || z.email().safeParse(v).success, {
      message: "Enter a valid email address",
    }),
  newPassword: z.string().refine((v) => v === "" || v.length >= 8, {
    message: "Password must be at least 8 characters",
  }),
});

export type UpdateCredentialsFormValues = z.infer<
  typeof updateCredentialsSchema
>;
