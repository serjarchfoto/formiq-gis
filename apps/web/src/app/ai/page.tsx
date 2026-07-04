import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";

export default function AIPage() {
  return (
    <main className="flex h-screen bg-[#F8FAFC]">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <TopBar />

        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h1 className="text-5xl font-bold text-[#111827]">AI-ассистент</h1>
          </div>
        </div>
      </div>
    </main>
  );
}
