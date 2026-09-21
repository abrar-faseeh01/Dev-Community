"use client";

import { ExperienceSection } from "./experience-section";
import { ProfileEditShell } from "./profile-edit-shell";

export function ExperienceEditView({ id }: { id: string }) {
  return (
    <ProfileEditShell targetId={id} title="Edit experience">
      {({ profile, isOwn }) => (
        <ExperienceSection profile={profile} isOwn={isOwn} />
      )}
    </ProfileEditShell>
  );
}
