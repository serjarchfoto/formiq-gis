"use client";

import Image from "next/image";
import { useLayers } from "@/store/layers";
import { useProjectStore } from "@/store/project";

export default function Sidebar() {
  const project = useProjectStore((state) => state.project);
  const setActiveTerritory = useProjectStore((state) => state.setActiveTerritory);
  const layers = useLayers((state) => state.layers);

  return (
    <aside className="flex w-[260px] flex-col border-r border-[#E5E7EB] bg-[#F8FAFC]">
      <div className="flex h-20 items-center border-b border-[#E5E7EB] px-6">
        <Image
          src="/logo/logo-light.png"
          alt="FORMIQ"
          width={120}
          height={28}
          priority
          style={{ width: "120px", height: "auto" }}
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <TreeSection title="Проект">
          <TreeItem active label={project.name} meta="локальный проект" />
        </TreeSection>

        <TreeSection title="Территории">
          {project.territories.length === 0 ? (
            <EmptyItem label="Территории пока нет" />
          ) : (
            project.territories.map((territory) => (
              <button
                key={territory.id}
                onClick={() => setActiveTerritory(territory.id)}
                className={`w-full rounded-xl px-3 py-2 text-left transition ${
                  territory.isActive ? "bg-white shadow-sm" : "hover:bg-white"
                }`}
              >
                <span className="block truncate text-sm font-semibold text-[#111827]">
                  {formatTerritoryName(territory.name)}
                </span>
                <span className="text-xs text-[#6B7280]">
                  буфер {territory.loadingBuffer.distanceMeters} м
                </span>
              </button>
            ))
          )}
        </TreeSection>

        <TreeSection title="Слои">
          {layers.map((layer) => (
            <TreeItem
              key={layer.id}
              label={layer.name}
              meta={layer.visible ? "видимый" : "скрыт"}
            />
          ))}
        </TreeSection>

        <TreeSection title="Ядра">
          <TreeItem label="Движок анализа" meta="готов" />
          <TreeItem label="Тематические карты" meta={formatThematicMapType(project.settings.display.activeThematicMapType)} />
          <TreeItem label="Белая модель" meta={formatStatus(project.whiteModel.status)} />
          <TreeItem label="Семантический 3D" meta={formatStatus(project.semantic3D.status)} />
          <TreeItem label="AI-контекст" meta="подготовлен" />
        </TreeSection>
      </nav>

      <div className="border-t border-[#E5E7EB] p-5">
        <div className="flex items-center gap-3">
          <Image
            src="/logo/icon.png"
            alt="FORMIQ"
            width={36}
            height={36}
          />

          <div>
            <p className="text-sm font-semibold text-[#111827]">Рабочее пространство</p>
            <p className="text-xs text-zinc-500">
              {project.history.length} операций
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TreeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function TreeItem({ label, meta, active = false }: { label: string; meta: string; active?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${active ? "bg-white shadow-sm" : ""}`}>
      <p className="truncate text-sm font-semibold text-[#111827]">{label}</p>
      <p className="truncate text-xs text-[#6B7280]">{meta}</p>
    </div>
  );
}

function EmptyItem({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#D1D5DB] px-3 py-3 text-xs text-[#9CA3AF]">
      {label}
    </div>
  );
}

function formatStatus(status: string): string {
  if (status === "not-created") return "не создан";
  if (status === "planned") return "запланирован";
  if (status === "generated") return "готов";
  return status;
}

function formatThematicMapType(value: string): string {
  const labels: Record<string, string> = {
    none: "нет",
    floors: "этажность",
    age: "возраст",
    function: "функции",
    vegetation: "озеленение",
    water: "вода",
  };

  return labels[value] ?? value;
}

function formatTerritoryName(name: string): string {
  return name.startsWith("Territory ") ? name.replace("Territory ", "Территория ") : name;
}
