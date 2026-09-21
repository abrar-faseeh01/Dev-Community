import { ProfileEditView } from "@/features/profile/components/profile-edit-view";

export default async function EditProfilePage({
  params,
}: PageProps<"/profile/edit/[id]">) {
  const { id } = await params;
  return <ProfileEditView id={id} />;
}
