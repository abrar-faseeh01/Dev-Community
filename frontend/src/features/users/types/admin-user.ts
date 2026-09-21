// A row of GET /users (admin only).
export type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "user";
  createdAt: string;
};
