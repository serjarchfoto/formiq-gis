"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getCachedAnalysisResult, isThematicMapDefinition } from "@/lib";
import { useProjectStore } from "@/store/project";
import { useUIStore } from "@/store/ui";
import type { FormiqProjectData, ProjectWorkspaceMode } from "@/types/formiq";

type WorkflowStage = "projects" | "architecture" | "analysis" | "presentation" | "3d";

interface NavItem {
  id: WorkflowStage;
  label: string;
  href: string;
  mode?: ProjectWorkspaceMode;
}

const navigationItems: NavItem[] = [
  { id: "projects", label: "Проекты", href: "/" },
  { id: "architecture", label: "Архитектура", href: "/map", mode: "architecture" },
  { id: "analysis", label: "Анализ", href: "/analysis", mode: "analysis" },
  { id: "presentation", label: "Презентация", href: "/export", mode: "presentation" },
  { id: "3d", label: "3D", href: "/map?mode=3d", mode: "3d" },
];

export default function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#F8FAFC] font-[Inter_Variable,Inter,system-ui,sans-serif] text-[#0F172A]">
      <GlobalNavigation />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {children}
        <ReadinessNotice />
        <WorkflowPrompt />
      </div>
    </div>
  );
}

function GlobalNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const project = useProjectStore((state) => state.project);
  const setWorkspaceMode = useProjectStore((state) => state.setWorkspaceMode);
  const activeStage = getActiveStage(pathname, searchParams.get("mode"));
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsAccountMenuOpen(false);
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  return (
    <header style={{ padding: "0 24px" }} className="relative z-50 flex h-[72px] shrink-0 items-center justify-between border-b border-white/60 bg-white/58 backdrop-blur-3xl max-md:px-3">
      <div style={{ gap: 48 }} className="flex min-w-0 items-center">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="FORMIQ">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-[#229ED9]/25 bg-[#229ED9]/10 text-lg font-black text-[#229ED9]">
            F
          </span>
          <span className="hidden font-[General_Sans,Inter,sans-serif] text-xl font-bold tracking-normal sm:inline">
            FORMIQ
          </span>
        </Link>

        <nav style={{ gap: 12 }} className="flex min-w-0 items-center overflow-x-auto max-md:max-w-[calc(100vw-92px)]" aria-label="Разделы FORMIQ">
          {navigationItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => item.mode && setWorkspaceMode(item.mode)}
              style={{ paddingInline: 12 }}
              className={`relative flex h-10 shrink-0 items-center rounded-[12px] text-sm transition duration-200 ease-out hover:bg-white/45 ${
                activeStage === item.id ? "font-semibold text-[#0F172A]" : "font-medium text-[#475569]"
              }`}
            >
              <span>{item.label}</span>
              {activeStage === item.id ? (
                <span className="absolute inset-x-3 -bottom-[11px] h-0.5 bg-[#229ED9]" />
              ) : null}
            </Link>
          ))}
        </nav>
      </div>

      {pathname === "/" ? (
        <label className="absolute left-1/2 hidden w-[320px] -translate-x-1/2 md:block">
          <HeaderIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" icon="search" />
          <input
            id="formiq-global-project-search"
            aria-label="Поиск проектов"
            value={globalSearch}
            onChange={(event) => {
              setGlobalSearch(event.target.value);
              window.dispatchEvent(new CustomEvent("formiq:project-search", { detail: event.target.value }));
            }}
            placeholder="Поиск проектов…"
            className="h-[42px] w-full rounded-[14px] border border-white/70 bg-white/62 pl-10 pr-14 text-[13px] text-[#0F172A] outline-none backdrop-blur-3xl transition focus:border-[#229ED9]/60"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-[8px] border border-white/70 bg-white/70 px-2 py-1 text-[11px] font-semibold text-[#64748B]">⌘K</span>
        </label>
      ) : null}

      <div className="flex min-w-0 items-center gap-2">
        <div className="hidden min-w-0 items-center gap-3 lg:flex">
          <span className="max-w-44 truncate text-[13px] font-medium text-[#64748B]">{project.name}</span>
          <span className="rounded-full border border-white/70 bg-white/55 px-3 py-1.5 text-[12px] font-semibold text-[#64748B]">
            {getStageHint(activeStage)}
          </span>
        </div>
        <HeaderIconButton label="Справка" icon="help" />
        <HeaderIconButton label="Уведомления" icon="bell" />
        <HeaderIconButton label="Настройки" icon="settings" />
        <div className="relative">
          <button
            type="button"
            aria-label="Аккаунт"
            aria-haspopup="menu"
            aria-expanded={isAccountMenuOpen}
            title="Аккаунт"
            onClick={() => setIsAccountMenuOpen((current) => !current)}
            className="flex h-10 items-center gap-2 rounded-[12px] border border-white/70 bg-white/62 px-2 text-[13px] font-semibold text-[#0F172A] backdrop-blur-3xl transition duration-200 ease-out hover:-translate-y-0.5"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#229ED9] text-xs font-semibold text-white">A</span>
            <span className="hidden sm:inline">Аккаунт</span>
            <HeaderIcon icon="chevron" />
          </button>
          {isAccountMenuOpen ? (
            <div role="menu" aria-label="Меню аккаунта" className="absolute right-0 top-12 z-50 w-48 rounded-[16px] border border-white/70 bg-white/82 p-2 backdrop-blur-3xl">
              <button type="button" role="menuitem" className="flex h-10 w-full items-center rounded-[12px] px-3 text-left text-[13px] font-medium hover:bg-white/55">Профиль</button>
              <button type="button" role="menuitem" className="flex h-10 w-full items-center rounded-[12px] px-3 text-left text-[13px] font-medium hover:bg-white/55">Настройки аккаунта</button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function HeaderIcon({ icon, label, className = "" }: { icon: HeaderIconName; label?: string; className?: string }) {
  return (
    <span className={`grid h-4 w-4 place-items-center ${className}`} title={label} aria-hidden={label ? undefined : true}>
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {headerIconPaths[icon]}
      </svg>
    </span>
  );
}

function HeaderIconButton({ icon, label }: { icon: HeaderIconName; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-[12px] border border-white/70 bg-white/62 text-[#64748B] backdrop-blur-3xl transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/78 hover:text-[#0F172A]"
    >
      <HeaderIcon icon={icon} />
    </button>
  );
}

type HeaderIconName = "bell" | "chevron" | "help" | "search" | "settings";

const headerIconPaths: Record<HeaderIconName, ReactNode> = {
  bell: <path d="M6 16h12l-2-3V9a4 4 0 0 0-8 0v4l-2 3Zm4 3h4" />,
  chevron: <path d="m8 10 4 4 4-4" />,
  help: <path d="M9.1 9a3 3 0 1 1 5.8 1c-.4 1.2-1.6 1.8-2.4 2.6-.4.4-.5.8-.5 1.4M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  search: <path d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />,
  settings: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v3m0 12v3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M1 12h3m16 0h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />,
};

function WorkflowPrompt() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const project = useProjectStore((state) => state.project);
  const setWorkspaceMode = useProjectStore((state) => state.setWorkspaceMode);
  const dismissed = useUIStore((state) => state.dismissedWorkflowPrompts);
  const manualCompleted = useUIStore((state) => state.completedWorkflowStages);
  const dismiss = useUIStore((state) => state.dismissWorkflowPrompt);
  const readiness = getWorkflowReadiness(project);
  const activeStage = getActiveStage(pathname, searchParams.get("mode"));
  const prompt = getWorkflowPrompt(activeStage, readiness, dismissed, manualCompleted);

  if (!prompt) return null;

  const goNext = () => {
    dismiss(prompt.id);
    if (prompt.mode) {
      setWorkspaceMode(prompt.mode);
    }
    router.push(prompt.href);
  };

  return (
    <aside className="absolute right-6 top-6 z-40 w-[360px] rounded-[20px] border border-white/70 bg-white/72 p-4 backdrop-blur-3xl max-md:left-4 max-md:right-4 max-md:top-4 max-md:w-auto">
      <p className="text-sm font-semibold text-[#0F172A]">{prompt.title}</p>
      <p className="mt-1 text-[13px] leading-5 text-[#64748B]">{prompt.body}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => dismiss(prompt.id)}
          className="h-10 rounded-[14px] border border-white/70 bg-white/55 px-4 text-[13px] font-semibold transition duration-200 ease-out hover:-translate-y-0.5"
        >
          {prompt.stayLabel}
        </button>
        <button
          type="button"
          onClick={goNext}
          className="h-10 rounded-[14px] bg-[#229ED9] px-4 text-[13px] font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5"
        >
          {prompt.nextLabel}
        </button>
      </div>
    </aside>
  );
}

function ReadinessNotice() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const project = useProjectStore((state) => state.project);
  const readiness = getWorkflowReadiness(project);
  const stage = getActiveStage(pathname, searchParams.get("mode"));
  const message =
    stage === "analysis" && !readiness.hasImportedData
      ? "Анализ недоступен. Сначала необходимо импортировать территорию."
      : stage === "3d" && !readiness.threeD
        ? "Для открытия 3D сначала создайте модель проекта."
        : "";

  if (!message) return null;

  return (
    <aside className="absolute left-1/2 top-6 z-40 w-[min(520px,calc(100%-2rem))] -translate-x-1/2 rounded-[20px] border border-white/70 bg-white/72 p-4 text-center backdrop-blur-3xl">
      <p className="text-sm font-semibold text-[#0F172A]">{message}</p>
      <p className="mt-1 text-[13px] text-[#64748B]">
        Раздел открыт в режиме просмотра, приложение продолжает работать.
      </p>
    </aside>
  );
}

function getActiveStage(pathname: string, mode: string | null): WorkflowStage {
  if (pathname === "/") return "projects";
  if (pathname === "/analysis") return "analysis";
  if (pathname === "/export") return "presentation";
  if (pathname === "/map" && mode === "3d") return "3d";
  if (pathname === "/map") return "architecture";
  return "projects";
}

function getStageHint(stage: WorkflowStage): string {
  if (stage === "projects") return "Управление проектами";
  if (stage === "architecture") return "GIS и данные";
  if (stage === "analysis") return "Показатели и сценарии";
  if (stage === "presentation") return "Лист и легенда";
  return "Презентационный режим";
}

function getWorkflowReadiness(project: FormiqProjectData) {
  const hasTerritory = Boolean(project.activeTerritoryId && project.territories.length);
  const hasMap = Array.isArray(project.settings.display.mapCenter) && Number.isFinite(project.settings.display.mapZoom);
  const importedEntityCount =
    project.buildings.length +
    project.roads.length +
    project.vegetation.length +
    project.water.length +
    project.boundaries.length +
    project.poi.length +
    project.transitStops.length;
  const hasImportedData = importedEntityCount > 0 || project.dataSources.some((source) => source.status === "active");
  const hasThematicMaps =
    Object.values(project.thematicMaps).some(isThematicMapDefinition) ||
    project.settings.display.activeThematicMapType !== "none";
  const analysis = getCachedAnalysisResult(project);
  const hasAnalysis = Boolean(analysis) || Object.keys(project.analysisResults).length > 0;
  const hasScenario = project.history.some((operation) => operation.type === "analysis-built") || hasAnalysis;
  const hasReadyLayout = project.layoutViews.some((view) => view.status === "ready" || view.status === "exported");
  const hasLegend = hasThematicMaps || project.settings.threeD.showLegend;
  const hasScale = project.settings.display.showScaleBar;
  const hasFormat = Boolean(project.settings.export.paperFormat);
  const has3DModel =
    project.whiteModel.status !== "not-created" ||
    project.semantic3D.status !== "not-created" ||
    project.buildings.length > 0;

  return {
    architecture: hasTerritory && hasMap && hasImportedData && hasThematicMaps,
    analysis: hasAnalysis && hasScenario,
    presentation: hasReadyLayout && hasLegend && hasScale && hasFormat,
    threeD: has3DModel,
    hasImportedData,
  };
}

function getWorkflowPrompt(
  stage: WorkflowStage,
  readiness: ReturnType<typeof getWorkflowReadiness>,
  dismissed: Record<string, boolean>,
  manualCompleted: Record<string, boolean>
) {
  if (stage === "architecture" && readiness.architecture && !dismissed.architectureToAnalysis) {
    return {
      id: "architectureToAnalysis",
      title: "Импорт завершен.",
      body: "Можно перейти к анализу территории.",
      stayLabel: "Остаться",
      nextLabel: "Перейти в Анализ",
      href: "/analysis",
      mode: "analysis" as ProjectWorkspaceMode,
    };
  }

  if (stage === "analysis" && (readiness.analysis || manualCompleted.analysis) && !dismissed.analysisToPresentation) {
    return {
      id: "analysisToPresentation",
      title: "Анализ готов.",
      body: "Можно оформить экспортный лист.",
      stayLabel: "Позже",
      nextLabel: "Открыть Презентацию",
      href: "/export",
      mode: "presentation" as ProjectWorkspaceMode,
    };
  }

  if (stage === "presentation" && (readiness.presentation || manualCompleted.presentation) && !dismissed.presentationTo3d) {
    return {
      id: "presentationTo3d",
      title: "Лист готов.",
      body: "Можно открыть 3D режим для презентации.",
      stayLabel: "Закрыть",
      nextLabel: "Открыть 3D",
      href: "/map?mode=3d",
      mode: "3d" as ProjectWorkspaceMode,
    };
  }

  return null;
}
