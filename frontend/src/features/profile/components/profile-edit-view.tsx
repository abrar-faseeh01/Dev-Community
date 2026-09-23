"use client";

import { ProfileDetailsForm } from "./profile-details-form";
import { ProfileEditShell } from "./profile-edit-shell";

export function ProfileEditView({ id }: { id: string }) {
  return (
    <ProfileEditShell targetId={id} title="Edit profile" hideStatusBar>
      {({ profile, isOwn, footerSlot }) => (
        <ProfileDetailsForm
          profile={profile}
          isOwn={isOwn}
          footerSlot={footerSlot}
        />
      )}
    </ProfileEditShell>
  );
}
