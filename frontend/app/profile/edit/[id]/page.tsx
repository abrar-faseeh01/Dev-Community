"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import type { Experience, Profile } from "@/lib/types/profile";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type ExperienceDraft = {
  title: string;
  company: string;
  from: string;
  to: string;
  description: string;
  // Only meaningful for an admin editing someone else's profile — see
  // `reason` fields throughout this file.
  reason: string;
};

const EMPTY_EXPERIENCE_DRAFT: ExperienceDraft = {
  title: "",
  company: "",
  from: "",
  to: "",
  description: "",
  reason: "",
};

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15";
const textareaClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15";

export default function EditProfilePage() {
  const { id: targetId } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // --- full name (admin-on-someone-else only — self-editing your own name
  // is handled by the Settings page via PATCH /auth/me, which requires a
  // current-password check this route intentionally does not have) ---
  const [fullNameInput, setFullNameInput] = useState("");
  const [fullNameReason, setFullNameReason] = useState("");
  const [fullNameSaving, setFullNameSaving] = useState(false);
  const [fullNameError, setFullNameError] = useState("");
  const [fullNameSuccess, setFullNameSuccess] = useState("");

  // --- skills ---
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [skillsReason, setSkillsReason] = useState("");
  const [skillsSaving, setSkillsSaving] = useState(false);
  const [skillsError, setSkillsError] = useState("");
  const [skillsSuccess, setSkillsSuccess] = useState("");

  // --- add experience ---
  const [newExperience, setNewExperience] = useState<ExperienceDraft>(
    EMPTY_EXPERIENCE_DRAFT,
  );
  const [addingExperience, setAddingExperience] = useState(false);
  const [addExperienceError, setAddExperienceError] = useState("");

  // --- edit / delete experience ---
  const [editingExperienceId, setEditingExperienceId] = useState<string | null>(
    null,
  );
  const [editDraft, setEditDraft] = useState<ExperienceDraft>(
    EMPTY_EXPERIENCE_DRAFT,
  );
  const [savingExperienceId, setSavingExperienceId] = useState<string | null>(
    null,
  );
  const [experiencesError, setExperiencesError] = useState("");
  const [pendingDeleteExperienceId, setPendingDeleteExperienceId] = useState<
    string | null
  >(null);

  const isOwn = !!user && user.id === targetId;
  const isAdmin = user?.role === "admin";
  // The backend's owner-or-admin check on every write route is the real
  // security boundary; this is purely so a disallowed visitor sees a clear
  // message instead of a page that silently fails every save.
  const authorized = !authLoading && (isOwn || isAdmin);
  const unauthorized = !authLoading && !!user && !isOwn && !isAdmin;

  useEffect(() => {
    // Nothing to fetch for an unauthorized visitor — the "unauthorized"
    // render branch doesn't depend on `loading`, so it's left untouched.
    if (!authorized) return;
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setLoadError("");
      try {
        const res = await apiFetch(`/profile/${targetId}`);
        if (!cancelled) {
          setProfile(res.data);
          setSkills(res.data.skills);
          setFullNameInput(res.data.fullName);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load profile.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [authorized, authLoading, targetId]);

  async function saveFullName() {
    setFullNameSaving(true);
    setFullNameError("");
    setFullNameSuccess("");
    try {
      const res = await apiFetch(`/users/${targetId}/fullname`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: fullNameInput,
          reason: fullNameReason.trim() || undefined,
        }),
      });
      setProfile(res.data);
      setFullNameSuccess("Full name updated.");
    } catch (err) {
      setFullNameError(
        err instanceof Error ? err.message : "Failed to update full name.",
      );
    } finally {
      setFullNameSaving(false);
    }
  }

  function addSkillLocally() {
    const trimmed = skillInput.trim();
    if (!trimmed || skills.includes(trimmed)) {
      setSkillInput("");
      return;
    }
    setSkills((prev) => [...prev, trimmed]);
    setSkillInput("");
  }

  function removeSkillLocally(skill: string) {
    setSkills((prev) => prev.filter((s) => s !== skill));
  }

  async function saveSkills() {
    setSkillsSaving(true);
    setSkillsError("");
    setSkillsSuccess("");
    try {
      const res = await apiFetch(`/profile/${targetId}/skills`, {
        method: "PATCH",
        body: JSON.stringify({
          skills,
          reason: skillsReason.trim() || undefined,
        }),
      });
      setProfile(res.data);
      setSkills(res.data.skills);
      setSkillsSuccess("Skills updated.");
    } catch (err) {
      setSkillsError(
        err instanceof Error ? err.message : "Failed to update skills.",
      );
    } finally {
      setSkillsSaving(false);
    }
  }

  async function handleAddExperience(e: React.FormEvent) {
    e.preventDefault();
    setAddingExperience(true);
    setAddExperienceError("");
    try {
      const res = await apiFetch(`/profile/${targetId}/experiences`, {
        method: "POST",
        body: JSON.stringify({
          title: newExperience.title,
          company: newExperience.company,
          from: newExperience.from,
          // Left blank = ongoing: omit entirely rather than send "".
          to: newExperience.to.trim() || undefined,
          description: newExperience.description.trim() || undefined,
          reason: newExperience.reason.trim() || undefined,
        }),
      });
      setProfile(res.data);
      setNewExperience(EMPTY_EXPERIENCE_DRAFT);
    } catch (err) {
      setAddExperienceError(
        err instanceof Error ? err.message : "Failed to add experience.",
      );
    } finally {
      setAddingExperience(false);
    }
  }

  function startEditingExperience(exp: Experience) {
    if (!exp._id) return;
    setEditingExperienceId(exp._id);
    setEditDraft({
      title: exp.title,
      company: exp.company,
      from: exp.from,
      to: exp.to ?? "",
      description: exp.description ?? "",
      reason: "",
    });
    setExperiencesError("");
  }

  function cancelEditingExperience() {
    setEditingExperienceId(null);
  }

  async function saveEditedExperience(
    e: React.FormEvent,
    experienceId: string,
  ) {
    e.preventDefault();
    setSavingExperienceId(experienceId);
    setExperiencesError("");
    try {
      const res = await apiFetch(
        `/profile/${targetId}/experiences/${experienceId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: editDraft.title,
            company: editDraft.company,
            from: editDraft.from,
            // Unlike add: send the literal value (possibly "") so clearing
            // an end date on an EXISTING entry actually takes effect —
            // omitting the key here would mean "leave unchanged", not
            // "clear it", since this is a partial update.
            to: editDraft.to.trim(),
            description: editDraft.description.trim(),
            reason: editDraft.reason.trim() || undefined,
          }),
        },
      );
      setProfile(res.data);
      setEditingExperienceId(null);
    } catch (err) {
      setExperiencesError(
        err instanceof Error ? err.message : "Failed to update experience.",
      );
    } finally {
      setSavingExperienceId(null);
    }
  }

  function handleDeleteExperience(experienceId: string) {
    setPendingDeleteExperienceId(experienceId);
  }

  async function confirmDeleteExperience(reason?: string) {
    const experienceId = pendingDeleteExperienceId;
    if (!experienceId) return;
    setPendingDeleteExperienceId(null);

    setSavingExperienceId(experienceId);
    setExperiencesError("");
    try {
      const res = await apiFetch(
        `/profile/${targetId}/experiences/${experienceId}`,
        { method: "DELETE", body: JSON.stringify({ reason }) },
      );
      setProfile(res.data);
    } catch (err) {
      setExperiencesError(
        err instanceof Error ? err.message : "Failed to delete experience.",
      );
    } finally {
      setSavingExperienceId(null);
    }
  }

  return (
    <main className="flex flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-7">
          <p className="mb-1 text-sm font-medium text-accent">Profile</p>
          <h1 className="text-2xl font-bold tracking-tight">Edit profile</h1>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {(authLoading || (authorized && loading)) && (
            <p className="p-6 text-sm text-muted">Loading profile…</p>
          )}

          {unauthorized && (
            <div className="m-5 flex flex-col gap-3 sm:m-6">
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
              >
                You can only edit your own profile.
              </p>
              {user && (
                <Link
                  href={`/profile/${user.id}`}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  Go to your profile
                </Link>
              )}
            </div>
          )}

          {authorized && !loading && loadError && (
            <p
              role="alert"
              className="m-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700 sm:m-6"
            >
              {loadError}
            </p>
          )}

          {authorized && !loading && !loadError && profile && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
                <p className="text-sm text-muted">
                  {isOwn ? (
                    <>Signed in as {profile.fullName}</>
                  ) : (
                    <>
                      Editing {profile.fullName || profile.email}&rsquo;s
                      profile{" "}
                      <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                        Admin
                      </span>
                    </>
                  )}
                </p>
                <Link
                  href={`/profile/${profile.id}`}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  View profile
                </Link>
              </div>

              {/* Full name — admin-on-someone-else only. Self-editing your
                  own name is handled by Settings (PATCH /auth/me), which
                  has its own currentPassword gate this route doesn't. */}
              {!isOwn && (
                <section className="flex flex-col gap-3 border-b border-border p-5 sm:p-6">
                  <h2 className="text-sm font-semibold text-foreground">
                    Full name
                  </h2>

                  {fullNameError && (
                    <p
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
                    >
                      {fullNameError}
                    </p>
                  )}
                  {fullNameSuccess && (
                    <p
                      role="status"
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700"
                    >
                      {fullNameSuccess}
                    </p>
                  )}

                  <input
                    type="text"
                    value={fullNameInput}
                    onChange={(e) => setFullNameInput(e.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={fullNameReason}
                    onChange={(e) => setFullNameReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className={inputClass}
                  />

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={saveFullName}
                      disabled={fullNameSaving || !fullNameInput.trim()}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
                    >
                      {fullNameSaving ? "Saving…" : "Save full name"}
                    </button>
                  </div>
                </section>
              )}

              {/* Skills */}
              <section className="flex flex-col gap-3 border-b border-border p-5 sm:p-6">
                <h2 className="text-sm font-semibold text-foreground">
                  Skills
                </h2>

                {skillsError && (
                  <p
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
                  >
                    {skillsError}
                  </p>
                )}
                {skillsSuccess && (
                  <p
                    role="status"
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700"
                  >
                    {skillsSuccess}
                  </p>
                )}

                {skills.length === 0 ? (
                  <p className="text-sm text-muted">No skills yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {skills.map((skill) => (
                      <span
                        key={skill}
                        className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground"
                      >
                        {skill}
                        <button
                          type="button"
                          onClick={() => removeSkillLocally(skill)}
                          aria-label={`Remove ${skill}`}
                          className="text-muted transition-colors hover:text-red-600"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSkillLocally();
                      }
                    }}
                    placeholder="Add a skill (e.g. TypeScript)"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={addSkillLocally}
                    className="shrink-0 rounded-lg border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-background"
                  >
                    Add
                  </button>
                </div>

                {!isOwn && (
                  <input
                    type="text"
                    value={skillsReason}
                    onChange={(e) => setSkillsReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className={inputClass}
                  />
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={saveSkills}
                    disabled={skillsSaving}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
                  >
                    {skillsSaving ? "Saving…" : "Save skills"}
                  </button>
                </div>
              </section>

              {/* Experience */}
              <section className="flex flex-col gap-4 p-5 sm:p-6">
                <h2 className="text-sm font-semibold text-foreground">
                  Experience
                </h2>

                {experiencesError && (
                  <p
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
                  >
                    {experiencesError}
                  </p>
                )}

                {profile.experiences.length === 0 ? (
                  <p className="text-sm text-muted">No experience yet.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {profile.experiences.map((exp) => {
                      const isEditing =
                        !!exp._id && exp._id === editingExperienceId;
                      const isBusy =
                        !!exp._id && exp._id === savingExperienceId;

                      if (isEditing && exp._id) {
                        return (
                          <form
                            key={exp._id}
                            onSubmit={(e) => saveEditedExperience(e, exp._id!)}
                            className="flex flex-col gap-3 rounded-lg border border-accent/30 bg-background p-4"
                          >
                            <input
                              type="text"
                              required
                              placeholder="Title"
                              value={editDraft.title}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  title: e.target.value,
                                }))
                              }
                              className={inputClass}
                            />
                            <input
                              type="text"
                              required
                              placeholder="Company"
                              value={editDraft.company}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  company: e.target.value,
                                }))
                              }
                              className={inputClass}
                            />
                            <div className="flex gap-3">
                              <input
                                type="text"
                                required
                                placeholder="From (e.g. 2020)"
                                value={editDraft.from}
                                onChange={(e) =>
                                  setEditDraft((d) => ({
                                    ...d,
                                    from: e.target.value,
                                  }))
                                }
                                className={inputClass}
                              />
                              <input
                                type="text"
                                placeholder="To — leave blank if ongoing"
                                value={editDraft.to}
                                onChange={(e) =>
                                  setEditDraft((d) => ({
                                    ...d,
                                    to: e.target.value,
                                  }))
                                }
                                className={inputClass}
                              />
                            </div>
                            <textarea
                              placeholder="Description (optional)"
                              rows={2}
                              value={editDraft.description}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  description: e.target.value,
                                }))
                              }
                              className={textareaClass}
                            />
                            {!isOwn && (
                              <input
                                type="text"
                                placeholder="Reason (optional)"
                                value={editDraft.reason}
                                onChange={(e) =>
                                  setEditDraft((d) => ({
                                    ...d,
                                    reason: e.target.value,
                                  }))
                                }
                                className={inputClass}
                              />
                            )}
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelEditingExperience}
                                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={isBusy}
                                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
                              >
                                {isBusy ? "Saving…" : "Save"}
                              </button>
                            </div>
                          </form>
                        );
                      }

                      return (
                        <div
                          key={exp._id ?? `${exp.title}-${exp.company}`}
                          className="rounded-lg border border-border bg-background p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {exp.title}
                              </p>
                              <p className="text-sm text-muted">
                                {exp.company} · {exp.from} –{" "}
                                {exp.to || "Present"}
                              </p>
                              {exp.description && (
                                <p className="mt-2 text-sm text-foreground">
                                  {exp.description}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 gap-3 text-sm font-medium">
                              <button
                                type="button"
                                onClick={() => startEditingExperience(exp)}
                                className="text-accent hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  exp._id && handleDeleteExperience(exp._id)
                                }
                                className="text-red-600 hover:underline disabled:opacity-60"
                              >
                                {isBusy ? "…" : "Delete"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <form
                  onSubmit={handleAddExperience}
                  className="flex flex-col gap-3 rounded-lg border border-border p-4"
                >
                  <p className="text-sm font-semibold text-foreground">
                    Add experience
                  </p>

                  {addExperienceError && (
                    <p
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
                    >
                      {addExperienceError}
                    </p>
                  )}

                  <input
                    type="text"
                    required
                    placeholder="Title"
                    value={newExperience.title}
                    onChange={(e) =>
                      setNewExperience((d) => ({
                        ...d,
                        title: e.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                  <input
                    type="text"
                    required
                    placeholder="Company"
                    value={newExperience.company}
                    onChange={(e) =>
                      setNewExperience((d) => ({
                        ...d,
                        company: e.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                  <div className="flex gap-3">
                    <input
                      type="text"
                      required
                      placeholder="From (e.g. 2020)"
                      value={newExperience.from}
                      onChange={(e) =>
                        setNewExperience((d) => ({
                          ...d,
                          from: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                    <input
                      type="text"
                      placeholder="To — leave blank if ongoing"
                      value={newExperience.to}
                      onChange={(e) =>
                        setNewExperience((d) => ({
                          ...d,
                          to: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <textarea
                    placeholder="Description (optional)"
                    rows={2}
                    value={newExperience.description}
                    onChange={(e) =>
                      setNewExperience((d) => ({
                        ...d,
                        description: e.target.value,
                      }))
                    }
                    className={textareaClass}
                  />

                  {!isOwn && (
                    <input
                      type="text"
                      placeholder="Reason (optional)"
                      value={newExperience.reason}
                      onChange={(e) =>
                        setNewExperience((d) => ({
                          ...d,
                          reason: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={addingExperience}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
                    >
                      {addingExperience ? "Adding…" : "Add experience"}
                    </button>
                  </div>
                </form>
              </section>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDeleteExperienceId}
        title="Delete experience"
        message="Delete this experience? This cannot be undone."
        showReasonInput={!isOwn}
        onConfirm={confirmDeleteExperience}
        onCancel={() => setPendingDeleteExperienceId(null)}
      />
    </main>
  );
}
