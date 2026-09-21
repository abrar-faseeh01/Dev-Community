export type AuditLogEntry = {
  _id: string;
  adminId: string;
  adminFullName: string;
  targetUserId: string;
  targetFullName: string;
  action:
    | "update_skills"
    | "add_experience"
    | "update_experience"
    | "remove_experience"
    | "update_fullname"
    | "update_headline"
    | "update_bio"
    | "update_portfolio_projects"
    | "update_post"
    | "delete_post"
    | "delete_user";
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  reason?: string;
  createdAt: string;
};
