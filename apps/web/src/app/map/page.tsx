import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";
import { WorkspaceMapShell } from "@/features/workspace";

export default function MapPage() {
  return (
    <main className="flex h-screen bg-[#F8FAFC]">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />

        <WorkspaceMapShell />
      </div>
    </main>
  );
}
