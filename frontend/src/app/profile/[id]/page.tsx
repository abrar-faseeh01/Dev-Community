import { ProfileView } from "@/features/profile/components/profile-view";

export default async function ProfilePage({
  params,
}: PageProps<"/profile/[id]">) {
  const { id } = await params;
  return <ProfileView id={id} />;
}
