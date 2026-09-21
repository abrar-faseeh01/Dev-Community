import { ExperienceEditView } from "@/features/profile/components/experience-edit-view";

export default async function EditExperiencePage({
  params,
}: PageProps<"/profile/edit/[id]/experience">) {
  const { id } = await params;
  return <ExperienceEditView id={id} />;
}
