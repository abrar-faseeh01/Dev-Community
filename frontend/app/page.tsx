import { SystemStatus } from "@/components/system-status";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-foreground">
        Developer Community
      </h1>
      <SystemStatus />
    </main>
  );
}
