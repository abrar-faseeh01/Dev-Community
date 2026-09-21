"use client";

import { FullNameForm } from "./full-name-form";
import { ProfileDetailsForm } from "./profile-details-form";
import { ProfileEditShell } from "./profile-edit-shell";

export function ProfileEditView({ id }: { id: string }) {
  return (
    <ProfileEditShell targetId={id} title="Edit profile">
      {({ profile, isOwn }) => (
        <>
          <ProfileDetailsForm profile={profile} isOwn={isOwn} />
          {!isOwn && <FullNameForm profile={profile} />}
        </>
      )}
    </ProfileEditShell>
  );
}
