"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/store/project";
import type { FormiqProjectData } from "@/types/formiq";

type ProjectFilter = "all" | "favorites" | "recent" | "archive";
type ProjectSort = "name" | "date" | "size" | "lastOpened";
type ProjectViewMode = "list" | "grid";
type DashboardActivity = {
  id: string;
  action: string;
  projectName: string;
  createdAt: string;
  icon: IconName;
  tone: "primary" | "success" | "neutral";
};

const text = {
  eyebrow: "УПРАВЛЕНИЕ ПРОЕКТАМИ",
  title: "Ваши проекты",
  titleLine: "Всё в одном месте.",
  subtitle: "Создавайте, управляйте и организовывайте проекты городского анализа.",
  recentProjects: "Последние проекты",
  allProjects: "Все проекты",
  favorites: "Избранные",
  recent: "Недавние",
  archive: "Архив",
  actions: "Действия",
  appSettings: "Настройки приложения",
  createProject: "Создать проект",
  newProject: "Новый проект",
  heroImportProject: "Импортировать проект",
  importProject: "Импорт проекта",
  exportProject: "Экспорт проекта",
  exportSelected: "Экспорт выбранного",
  duplicate: "Дублировать",
  rename: "Переименовать",
  delete: "Удалить",
  archiveProject: "Архивировать",
  restoreProject: "Вернуть из архива",
  pin: "Закрепить",
  unpin: "Открепить",
  favorite: "В избранное",
  unfavorite: "Убрать из избранного",
  open: "Открыть",
  searchProjects: "Поиск проектов…",
  filters: "Фильтры",
  searchInProjects: "Поиск по названию",
  searchAuthor: "Поиск по автору",
  searchTags: "Поиск по тегам",
  sort: "Сортировка",
  sortName: "По названию",
  sortDate: "По дате",
  sortSize: "По размеру",
  sortLastOpened: "По последнему открытию",
  name: "Название",
  description: "Описание",
  city: "Локация",
  author: "Автор",
  tags: "Теги",
  tagsHint: "Через запятую",
  requiredName: "Название проекта обязательно.",
  createError: "Не удалось создать проект. Попробуйте еще раз.",
  importError: "Не удалось импортировать .formiq файл.",
  importSuccess: "Проект импортирован.",
  renameError: "Не удалось переименовать проект.",
  deleteTitle: "Удалить проект",
  deleteConfirm: "Удалить проект? Это действие нельзя отменить.",
  renameTitle: "Переименовать проект",
  cancel: "Отмена",
  save: "Сохранить",
  creating: "Создание...",
  loading: "Загрузка проектов...",
  empty: "Проекты не найдены.",
  noProjects: "Создайте первый проект или импортируйте .formiq файл.",
  noSearchResults: "По этому запросу проектов не найдено.",
  loadError: "Не удалось загрузить проекты.",
  retry: "Повторить",
  noAuthor: "Автор не указан",
  noTags: "Без тегов",
  storage: "Хранилище",
  theme: "Светлая тема",
  compactMode: "Компактный список",
  backups: "Резервные копии",
  account: "Аккаунт",
  about: "О FORMIQ",
  version: "FORMIQ 1.0.0",
  selected: "Выбранный проект",
};

const initialForm = {
  name: "",
  description: "",
  city: "",
  author: "",
  tags: "",
};

export default function CreateProjectPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projects = useProjectStore((state) => state.projects);
  const createProject = useProjectStore((state) => state.createProject);
  const loadAll = useProjectStore((state) => state.loadAll);
  const openProject = useProjectStore((state) => state.openProject);
  const updateProject = useProjectStore((state) => state.updateProject);
  const duplicateProject = useProjectStore((state) => state.duplicateProject);
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const importProject = useProjectStore((state) => state.importProject);
  const setProjectArchived = useProjectStore((state) => state.setProjectArchived);
  const setProjectPinned = useProjectStore((state) => state.setProjectPinned);
  const setProjectFavorite = useProjectStore((state) => state.setProjectFavorite);

  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [renamingProject, setRenamingProject] = useState<FormiqProjectData | null>(null);
  const [deletingProject, setDeletingProject] = useState<FormiqProjectData | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ProjectFilter>("all");
  const [sortBy, setSortBy] = useState<ProjectSort>("lastOpened");
  const [projectViewMode, setProjectViewMode] = useState<ProjectViewMode>("list");
  const [projectQuery, setProjectQuery] = useState("");
  const [authorQuery, setAuthorQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [projectLoadError, setProjectLoadError] = useState("");
  const [renameError, setRenameError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [isContextDrawerOpen, setIsContextDrawerOpen] = useState(false);
  const projectSearchRef = useRef<HTMLInputElement | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadingFallback = window.setTimeout(() => {
      if (isMounted) {
        setIsLoading(false);
      }
    }, 1500);

    loadAll()
      .then(() => setProjectLoadError(""))
      .catch(() => setProjectLoadError(text.loadError))
      .finally(() => {
        window.clearTimeout(loadingFallback);
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
      window.clearTimeout(loadingFallback);
    };
  }, [loadAll]);

  useEffect(() => {
    if (!isContextDrawerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsContextDrawerOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isContextDrawerOpen]);

  const filteredProjects = useMemo(() => {
    const normalizedProjectQuery = normalizeSearch(projectQuery);
    const normalizedAuthorQuery = normalizeSearch(authorQuery);
    const requestedTags = parseTags(tagQuery).map(normalizeSearch);

    return projects
      .filter((project) => {
        if (activeFilter === "archive") return project.isArchived;
        if (project.isArchived) return false;
        if (activeFilter === "favorites") return project.isFavorite;
        return true;
      })
      .filter((project) => {
        if (!normalizedProjectQuery) return true;
        return normalizeSearch(project.name).includes(normalizedProjectQuery);
      })
      .filter((project) => {
        if (!normalizedAuthorQuery) return true;
        return normalizeSearch(project.author).includes(normalizedAuthorQuery);
      })
      .filter((project) => {
        if (!requestedTags.length) return true;
        const projectTags = project.tags.map(normalizeSearch);
        return requestedTags.every((tag) => projectTags.some((projectTag) => projectTag.includes(tag)));
      })
      .sort((left, right) => compareProjects(left, right, sortBy));
  }, [activeFilter, authorQuery, projectQuery, projects, sortBy, tagQuery]);

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? filteredProjects[0] ?? projects[0] ?? null;
  const visibleProjects = activeFilter === "recent" ? filteredProjects.slice(0, 5) : filteredProjects;
  const storageBytes = projects.reduce((total, project) => total + getProjectSize(project), 0);
  const storageLimitBytes = 10 * 1024 * 1024 * 1024;
  const dashboardStorageLimitBytes = 10 * 1024 * 1024 * 1024;
  const storagePercent = Math.min(100, Number(((storageBytes / storageLimitBytes) * 100).toFixed(1)));
  const recentActivity = useMemo(() => buildDashboardActivity(selectedProject), [selectedProject]);
  const connectedSources = selectedProject?.dataSources ?? [];
  const activeSourceCount = connectedSources.filter((source) => source.status === "active").length;
  const errorSourceCount = connectedSources.filter((source) => source.status === "error").length;
  const inactiveSourceCount = connectedSources.filter((source) => source.status === "inactive").length;

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.name.trim()) {
      setError(text.requiredName);
      return;
    }

    setIsSubmitting(true);

    try {
      const project = await createProject({
        name: form.name,
        description: form.description,
        city: form.city,
        author: form.author,
        tags: parseTags(form.tags),
      });
      setForm(initialForm);
      router.push(`/map?projectId=${encodeURIComponent(project.id)}`);
    } catch {
      setError(text.createError);
      setIsSubmitting(false);
    }
  };

  const handleOpenProject = async (projectId: string) => {
    await openProject(projectId);
    router.push(`/map?projectId=${encodeURIComponent(projectId)}`);
  };

  const handleDuplicateProject = async (projectId: string) => {
    const project = await duplicateProject(projectId);
    setSelectedProjectId(project?.id ?? projectId);
    setMenuProjectId(null);
  };

  const handleToggleArchive = async (project: FormiqProjectData) => {
    const updatedProject = await setProjectArchived(project.id, !project.isArchived);
    setSelectedProjectId(updatedProject?.id ?? project.id);
    setMenuProjectId(null);
  };

  const handleTogglePin = async (project: FormiqProjectData) => {
    const updatedProject = await setProjectPinned(project.id, !project.isPinned);
    setSelectedProjectId(updatedProject?.id ?? project.id);
    setMenuProjectId(null);
  };

  const handleToggleFavorite = async (project: FormiqProjectData) => {
    const updatedProject = await setProjectFavorite(project.id, !project.isFavorite);
    setSelectedProjectId(updatedProject?.id ?? project.id);
    setMenuProjectId(null);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const importedProject = await importProject(JSON.parse(await file.text()));

      if (!importedProject) {
        throw new Error("Invalid .formiq file");
      }

      setSelectedProjectId(importedProject.id);
      setNotice(text.importSuccess);
    } catch {
      setNotice(text.importError);
    }
  };

  const startRename = (project: FormiqProjectData) => {
    setRenamingProject(project);
    setRenameValue(project.name);
    setRenameError("");
    setMenuProjectId(null);
  };

  const confirmRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!renamingProject || !renameValue.trim()) {
      setRenameError(text.requiredName);
      return;
    }

    const updatedProject = await updateProject(renamingProject.id, {
      name: renameValue.trim(),
    });

    if (!updatedProject) {
      setRenameError(text.renameError);
      return;
    }

    setSelectedProjectId(updatedProject.id);
    setRenamingProject(null);
    setRenameValue("");
  };

  const confirmDelete = async () => {
    if (!deletingProject) {
      return;
    }

    await deleteProject(deletingProject.id);
    setDeletingProject(null);
    setSelectedProjectId(null);
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!filterPopoverRef.current) return;
      if (!filterPopoverRef.current.contains(event.target as Node)) {
        setIsFilterPopoverOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFilterPopoverOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const globalSearch = document.getElementById("formiq-global-project-search") as HTMLInputElement | null;
        const searchInput = globalSearch ?? projectSearchRef.current;
        searchInput?.focus();
        searchInput?.select();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const handleGlobalSearch = (event: Event) => {
      setProjectQuery((event as CustomEvent<string>).detail ?? "");
    };

    window.addEventListener("formiq:project-search", handleGlobalSearch);
    return () => window.removeEventListener("formiq:project-search", handleGlobalSearch);
  }, []);

  return (
    <main className="h-full overflow-y-auto bg-[#F8FAFC] font-[Inter_Variable,Inter,system-ui,sans-serif] text-[#0F172A]">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_16%,rgba(34,158,217,0.16),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.95)_0%,rgba(248,250,252,0.76)_42%,rgba(226,242,250,0.82)_100%)]" />
        <div className="absolute right-0 top-0 h-[54vh] w-[58vw] -skew-x-12 border-l border-white/60 bg-white/20 backdrop-blur-sm" />
        <div className="absolute bottom-0 left-[15%] h-[42vh] w-[95vw] -skew-x-12 border-t border-white/70 bg-white/25" />
      </div>

      <div className="relative grid min-h-full grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside style={{ padding: 20 }} className="hidden border-r border-white/60 bg-white/42 backdrop-blur-3xl lg:flex lg:flex-col">
          <nav className="mt-0 space-y-1">
            <SidebarButton active={activeFilter === "all"} onClick={() => setActiveFilter("all")} icon="grid">
              {text.allProjects}
            </SidebarButton>
            <SidebarButton active={activeFilter === "favorites"} onClick={() => setActiveFilter("favorites")} icon="star">
              {text.favorites}
            </SidebarButton>
            <SidebarButton active={activeFilter === "recent"} onClick={() => setActiveFilter("recent")} icon="clock">
              {text.recent}
            </SidebarButton>
            <SidebarButton active={activeFilter === "archive"} onClick={() => setActiveFilter("archive")} icon="archive">
              {text.archive}
            </SidebarButton>
          </nav>

          <div className="mt-[140px] space-y-5">
            <section style={{ padding: 20 }} className="rounded-[20px] border border-white/60 bg-white/62 backdrop-blur-3xl">
              <p className="text-[13px] font-semibold">{text.storage}</p>
              <p className="mt-5 text-[13px] text-[#64748B]">
                {formatBytes(storageBytes)} из {formatBytes(storageLimitBytes)} использовано
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E2E8F0]">
                <div className="h-full rounded-full bg-[#229ED9]" style={{ width: `${storagePercent}%` }} />
              </div>
              <p className="mt-3 text-[13px] text-[#64748B]">{storagePercent}%</p>
              <div className="mt-3">
                <button
                  type="button"
                  style={{ width: "100%", whiteSpace: "nowrap" }}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-white/70 bg-white/55 px-3 text-[12px] font-semibold text-[#0F172A] transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/75"
                >
                  <Icon name="plus" />
                  Увеличить объём
                </button>
              </div>
            </section>

            <section style={{ padding: 12 }} className="rounded-[20px] border border-white/60 bg-white/62 backdrop-blur-3xl">
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-3 rounded-[12px] px-2 text-left transition duration-200 ease-out hover:bg-white/45"
              >
                <Icon className="h-5 w-5 text-[#64748B]" name="sun" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{text.theme}</span>
                </span>
                <Icon name="chevron" />
              </button>
            </section>
            <div className="px-2 text-[12px] text-[#64748B]">
              <p className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" aria-hidden="true" />
                Все системы работают
              </p>
              <p className="mt-2">{text.version}</p>
            </div>
          </div>
        </aside>

        <section style={{ padding: "12px 16px 20px" }} className="min-w-0">
          <header className="mb-3 xl:hidden">
            <div className="flex flex-col gap-3 md:grid md:grid-cols-[1fr_minmax(460px,520px)_1fr] md:items-center">
              <div className="hidden md:block" />
              <SearchInput
                inputRef={projectSearchRef}
                value={projectQuery}
                onChange={setProjectQuery}
                placeholder={text.searchProjects}
                hint="Ctrl+K / ⌘K"
              />

              <div className="flex items-center gap-3 md:justify-self-end">
                <div className="relative" ref={filterPopoverRef}>
                  <button
                    type="button"
                    onClick={() => setIsFilterPopoverOpen((current) => !current)}
                    className={`flex h-[46px] items-center gap-2 rounded-[14px] border px-4 text-[13px] font-semibold backdrop-blur-3xl transition duration-200 ease-out hover:-translate-y-0.5 ${
                      isFilterPopoverOpen ? "border-[#229ED9]/40 bg-white/82 text-[#0F172A]" : "border-white/70 bg-white/62"
                    }`}
                  >
                    <Icon name="list" />
                    {text.filters}
                  </button>

                  {isFilterPopoverOpen ? (
                    <div className="absolute right-0 top-[52px] z-40 w-[320px] rounded-[20px] border border-white/70 bg-white/82 p-4 backdrop-blur-3xl">
                      <div className="grid gap-3">
                        <SearchInput value={authorQuery} onChange={setAuthorQuery} placeholder={text.searchAuthor} />
                        <SearchInput value={tagQuery} onChange={setTagQuery} placeholder={text.searchTags} />
                        <label className="grid gap-2 text-[13px] font-medium text-[#64748B]">
                          {text.sort}
                          <select
                            value={sortBy}
                            onChange={(event) => setSortBy(event.target.value as ProjectSort)}
                            className="h-11 rounded-[14px] border border-white/70 bg-white/62 px-3 text-[13px] font-medium outline-none backdrop-blur-3xl"
                          >
                            <option value="name">{text.sortName}</option>
                            <option value="date">{text.sortDate}</option>
                            <option value="size">{text.sortSize}</option>
                            <option value="lastOpened">{text.sortLastOpened}</option>
                          </select>
                        </label>
                        <label className="flex h-11 items-center justify-between rounded-[14px] px-2 text-sm transition hover:bg-white/45">
                          <span className="flex items-center gap-3">
                            <Icon name="list" />
                            {text.compactMode}
                          </span>
                          <input
                            type="checkbox"
                            checked={isCompact}
                            onChange={(event) => setIsCompact(event.target.checked)}
                            className="h-4 w-4 accent-[#229ED9]"
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}
                </div>

                <IconButton label={text.appSettings} icon="settings" />
                <IconButton label={text.account} icon="bell" />
                <button
                  type="button"
                  aria-controls="project-context-drawer"
                  aria-expanded={isContextDrawerOpen}
                  onClick={() => setIsContextDrawerOpen(true)}
                  className="inline-flex h-[46px] items-center gap-2 rounded-[14px] border border-white/70 bg-white/62 px-4 text-sm font-semibold text-[#0F172A] backdrop-blur-3xl transition duration-200 ease-out hover:-translate-y-0.5 xl:hidden"
                >
                  <Icon name="context" />
                  Контекст
                </button>
              </div>
            </div>
          </header>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_304px]">
            <div className="min-w-0 space-y-6">
              <section style={{ padding: "32px 36px" }} className="relative min-h-[356px] overflow-hidden rounded-[20px] border border-white/55 bg-white/44 backdrop-blur-3xl">
                <div
                  className="pointer-events-none absolute inset-0 bg-cover bg-[center_right] bg-no-repeat opacity-[0.68]"
                  style={{ backgroundImage: "url('/images/formiq-dashboard-bg.png')" }}
                />
                <div className="pointer-events-none absolute inset-y-3 right-6 flex items-center">
                  <span className="select-none text-[clamp(240px,22vw,340px)] font-black leading-none text-[#0F172A] opacity-[0.025]">
                    FORMIQ
                  </span>
                </div>
                <p className="relative text-[13px] font-semibold uppercase tracking-[0.02em] text-[#229ED9]">
                  {text.eyebrow}
                </p>
                <h1 className="relative mt-4 max-w-2xl text-[40px] font-bold leading-[1.08] text-[#0F172A]">
                  {text.title}.<br />
                  {text.titleLine}
                </h1>
                <p className="relative mt-4 max-w-xl text-[16px] leading-[1.5] text-[#64748B]">{text.subtitle}</p>

                <div className="relative mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    data-testid="create-project-button"
                    onClick={() => setIsCreateModalOpen(true)}
                    className="inline-flex h-[46px] items-center gap-2 rounded-[14px] bg-[#229ED9] px-5 text-sm font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5"
                  >
                    <Icon name="plus" />
                    {text.newProject}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex h-[46px] items-center gap-2 rounded-[14px] border border-white/70 bg-white/62 px-5 text-sm font-semibold text-[#0F172A] backdrop-blur-3xl transition duration-200 ease-out hover:-translate-y-0.5"
                  >
                    <Icon name="upload" />
                    {text.heroImportProject}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".formiq,application/json"
                    className="hidden"
                    onChange={handleImportFile}
                  />
                </div>

                {notice ? <p className="relative mt-4 text-[13px] font-medium text-[#64748B]">{notice}</p> : null}
                <div className="relative mt-7 grid gap-3 sm:grid-cols-3">
                  <MetricPill label="Проекты" value={String(projects.length)} />
                  <MetricPill label="Текущий" value={selectedProject ? selectedProject.name : "Нет"} />
                  <MetricPill label="Хранилище" value={`${formatBytes(storageBytes)} / 10 GB`} />
                </div>
              </section>

              <section
                style={{ padding: 20 }}
                className="rounded-[20px] border border-white/70 bg-white/62 backdrop-blur-3xl"
                aria-labelledby="project-list-title"
              >
                <div className="flex flex-col gap-4 border-b border-[#E2E8F0]/70 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-baseline gap-3">
                      <h2 id="project-list-title" className="text-2xl font-semibold">
                        {text.recentProjects}
                      </h2>
                      <span className="text-[13px] font-medium text-[#64748B]">{visibleProjects.length} {formatProjectCount(visibleProjects.length)}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <SearchInput value={projectQuery} onChange={setProjectQuery} placeholder={text.searchInProjects} compact />
                      <label className="relative">
                        <span className="sr-only">{text.sort}</span>
                        <select
                          value={sortBy}
                          onChange={(event) => setSortBy(event.target.value as ProjectSort)}
                          className="h-10 rounded-[14px] border border-white/70 bg-white/62 px-3 pr-8 text-[13px] font-medium text-[#0F172A] outline-none backdrop-blur-3xl transition focus:border-[#229ED9]/60"
                        >
                          <option value="lastOpened">{text.sortLastOpened}</option>
                          <option value="date">{text.sortDate}</option>
                          <option value="name">{text.sortName}</option>
                          <option value="size">{text.sortSize}</option>
                        </select>
                      </label>
                      <ViewToggle value={projectViewMode} onChange={setProjectViewMode} />
                    </div>
                  </div>

                  <SegmentedFilters activeFilter={activeFilter} onChange={setActiveFilter} />
                </div>

                {projectLoadError ? (
                  <ProjectEmptyState
                    title={text.loadError}
                    description="Проверьте локальное хранилище и повторите загрузку."
                    actionLabel={text.retry}
                    onAction={() => {
                      setProjectLoadError("");
                      setIsLoading(true);
                      loadAll()
                        .then(() => setProjectLoadError(""))
                        .catch(() => setProjectLoadError(text.loadError))
                        .finally(() => setIsLoading(false));
                    }}
                  />
                ) : isLoading ? (
                  <ProjectListSkeleton />
                ) : visibleProjects.length === 0 ? (
                  <ProjectEmptyState
                    title={projectQuery.trim() ? text.noSearchResults : text.empty}
                    description={projectQuery.trim() ? "Измените запрос или очистите фильтры." : text.noProjects}
                    actionLabel={text.newProject}
                    onAction={() => setIsCreateModalOpen(true)}
                  />
                ) : (
                  <div
                    className={
                      projectViewMode === "grid"
                        ? "mt-4 grid gap-3 xl:grid-cols-2"
                        : "mt-3 divide-y divide-[#E2E8F0]/70"
                    }
                    data-testid="project-list"
                  >
                    {visibleProjects.map((project) => (
                      <ProjectRow
                        key={project.id}
                        menuOpen={menuProjectId === project.id}
                        project={project}
                        selected={selectedProject?.id === project.id}
                        viewMode={projectViewMode}
                        onSelect={() => setSelectedProjectId(project.id)}
                        onOpen={handleOpenProject}
                        onMenu={() => setMenuProjectId((current) => (current === project.id ? null : project.id))}
                        onRename={startRename}
                        onDuplicate={handleDuplicateProject}
                        onDelete={(nextProject) => {
                          setDeletingProject(nextProject);
                          setMenuProjectId(null);
                        }}
                        onArchive={handleToggleArchive}
                        onPin={handleTogglePin}
                        onFavorite={handleToggleFavorite}
                        onExport={exportProjectFile}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="hidden w-[304px] space-y-4 xl:block">
              <ProjectContextPanels
                project={selectedProject}
                activities={recentActivity}
                activeSourceCount={activeSourceCount}
                inactiveSourceCount={inactiveSourceCount}
                errorSourceCount={errorSourceCount}
                storageBytes={storageBytes}
                storageLimitBytes={dashboardStorageLimitBytes}
                isCompact={isCompact}
                onCompactChange={setIsCompact}
                onImport={() => fileInputRef.current?.click()}
                onExport={exportProjectFile}
                onDuplicate={handleDuplicateProject}
                onDelete={(project) => setDeletingProject(project)}
              />
            </aside>
          </div>
        </section>
      </div>

      {isContextDrawerOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden" role="presentation">
          <button
            type="button"
            aria-label="Закрыть контекстную панель"
            onClick={() => setIsContextDrawerOpen(false)}
            className="absolute inset-0 bg-[#0F172A]/12 backdrop-blur-[2px]"
          />
          <aside
            id="project-context-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-context-title"
            className="absolute inset-y-0 right-0 w-[min(304px,calc(100vw-24px))] overflow-y-auto border-l border-white/45 bg-white/72 p-4 backdrop-blur-3xl"
          >
            <div className="mb-4 flex items-center justify-between px-1">
              <h2 id="project-context-title" className="text-base font-semibold text-[#0F172A]">Контекст проекта</h2>
              <button
                type="button"
                aria-label="Закрыть контекстную панель"
                onClick={() => setIsContextDrawerOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-[14px] transition duration-200 ease-out hover:bg-white/60"
              >
                <Icon name="x" />
              </button>
            </div>
            <ProjectContextPanels
              project={selectedProject}
              activities={recentActivity}
              activeSourceCount={activeSourceCount}
              inactiveSourceCount={inactiveSourceCount}
              errorSourceCount={errorSourceCount}
              storageBytes={storageBytes}
              storageLimitBytes={dashboardStorageLimitBytes}
              isCompact={isCompact}
              onCompactChange={setIsCompact}
              onImport={() => fileInputRef.current?.click()}
              onExport={exportProjectFile}
              onDuplicate={handleDuplicateProject}
              onDelete={(project) => setDeletingProject(project)}
            />
          </aside>
        </div>
      ) : null}

      {isCreateModalOpen ? (
        <Modal title={text.createProject} titleId="create-project-title" onClose={() => setIsCreateModalOpen(false)}>
          <form onSubmit={handleSubmit} data-testid="create-project-dialog">
            <div className="grid gap-4">
              <Field label={text.name}>
                <input
                  data-testid="create-project-name"
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  required
                  autoFocus
                  className={inputClassName}
                />
              </Field>
              <Field label={text.description}>
                <textarea
                  data-testid="create-project-description"
                  value={form.description}
                  onChange={(event) => updateField("description", event.target.value)}
                  rows={3}
                  className={`${inputClassName} h-auto resize-none py-3`}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={text.city}>
                  <input
                    data-testid="create-project-city"
                    value={form.city}
                    onChange={(event) => updateField("city", event.target.value)}
                    className={inputClassName}
                  />
                </Field>
                <Field label={text.author}>
                  <input
                    data-testid="create-project-author"
                    value={form.author}
                    onChange={(event) => updateField("author", event.target.value)}
                    className={inputClassName}
                  />
                </Field>
              </div>
              <Field label={`${text.tags} · ${text.tagsHint}`}>
                <input
                  value={form.tags}
                  onChange={(event) => updateField("tags", event.target.value)}
                  className={inputClassName}
                />
              </Field>
            </div>

            {error ? <p className="mt-4 text-sm font-medium text-[#EF4444]">{error}</p> : null}

            <ModalActions>
              <button type="button" onClick={() => setIsCreateModalOpen(false)} className={secondaryButtonClassName}>
                {text.cancel}
              </button>
              <button
                type="submit"
                data-testid="create-project-submit"
                disabled={isSubmitting}
                className={primaryButtonClassName}
              >
                {isSubmitting ? text.creating : text.createProject}
              </button>
            </ModalActions>
          </form>
        </Modal>
      ) : null}

      {renamingProject ? (
        <Modal title={text.renameTitle} titleId="rename-project-title" onClose={() => setRenamingProject(null)}>
          <form onSubmit={confirmRename} data-testid="rename-project-dialog">
            <Field label={text.name}>
              <input
                data-testid="rename-project-name"
                value={renameValue}
                onChange={(event) => {
                  setRenameValue(event.target.value);
                  setRenameError("");
                }}
                autoFocus
                className={inputClassName}
              />
            </Field>

            {renameError ? <p className="mt-4 text-sm font-medium text-[#EF4444]">{renameError}</p> : null}

            <ModalActions>
              <button type="button" onClick={() => setRenamingProject(null)} className={secondaryButtonClassName}>
                {text.cancel}
              </button>
              <button type="submit" data-testid="rename-project-submit" className={primaryButtonClassName}>
                {text.save}
              </button>
            </ModalActions>
          </form>
        </Modal>
      ) : null}

      {deletingProject ? (
        <Modal title={text.deleteTitle} titleId="delete-project-title" onClose={() => setDeletingProject(null)}>
          <div data-testid="delete-project-dialog">
            <p className="text-sm leading-6 text-[#64748B]">{text.deleteConfirm}</p>
            <p className="mt-4 rounded-[14px] border border-white/70 bg-white/62 px-4 py-3 text-sm font-semibold">
              {deletingProject.name}
            </p>
            <ModalActions>
              <button type="button" onClick={() => setDeletingProject(null)} className={secondaryButtonClassName}>
                {text.cancel}
              </button>
              <button
                type="button"
                data-testid="delete-project-confirm"
                onClick={confirmDelete}
                className="h-11 rounded-[14px] bg-[#EF4444] px-5 text-sm font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5"
              >
                {text.delete}
              </button>
            </ModalActions>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

function ProjectRow({
  project,
  selected,
  menuOpen,
  viewMode,
  onSelect,
  onOpen,
  onMenu,
  onRename,
  onDuplicate,
  onDelete,
  onArchive,
  onPin,
  onFavorite,
  onExport,
}: {
  project: FormiqProjectData;
  selected: boolean;
  menuOpen: boolean;
  viewMode: ProjectViewMode;
  onSelect: () => void;
  onOpen: (projectId: string) => void;
  onMenu: () => void;
  onRename: (project: FormiqProjectData) => void;
  onDuplicate: (projectId: string) => void;
  onDelete: (project: FormiqProjectData) => void;
  onArchive: (project: FormiqProjectData) => void;
  onPin: (project: FormiqProjectData) => void;
  onFavorite: (project: FormiqProjectData) => void;
  onExport: (project: FormiqProjectData) => void;
}) {
  const metadataLabel = project.author || "GIS проект";

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`${project.name}. ${project.city || "Локация не указана"}`}
      className={`project-row relative grid min-h-[84px] grid-cols-[124px_minmax(0,1fr)_120px_96px] gap-4 px-3 py-2.5 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#229ED9]/45 ${
        selected ? "border border-[#229ED9]/45 bg-[#229ED9]/5" : "border border-transparent"
      } ${viewMode === "grid" ? "rounded-[18px] border-white/70 bg-white/62" : "border-b border-[#E2E8F0]/70"}`}
      data-testid={`project-card-${project.id}`}
      onMouseEnter={onSelect}
      onClick={() => onOpen(project.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(project.id);
        }
      }}
    >
      <div className="h-[70px] w-[124px] overflow-hidden rounded-[10px] border border-white/70 bg-white/70">
        <ProjectPreview project={project} />
      </div>

      <div className="min-w-0 self-center">
        <div className="flex flex-wrap items-center gap-2">
          {project.isPinned ? <Badge>Закреплен</Badge> : null}
          {project.isArchived ? <Badge>Архив</Badge> : null}
          <h3 className="truncate text-[16px] font-semibold leading-6 text-[#0F172A]" data-testid="project-card-name">
            {project.name}
          </h3>
        </div>
        <p className="mt-1 truncate text-[13px] text-[#64748B]">
          {project.city || "Локация не указана"} · {metadataLabel}
        </p>
      </div>

      <div className="self-center text-[13px] text-[#64748B]">
        <p className="font-medium text-[#0F172A]">{formatDate(project.metadata.updatedAt)}</p>
        <p className="mt-1">{formatBytes(getProjectSize(project))}</p>
      </div>

      <div className="relative flex items-center justify-start gap-2 self-center md:justify-end">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onFavorite(project);
          }}
          className={`grid h-10 w-10 place-items-center rounded-[14px] border border-white/70 transition duration-200 ease-out hover:-translate-y-0.5 ${
            project.isFavorite ? "bg-[#229ED9] text-white" : "bg-white/62"
          }`}
          aria-label={project.isFavorite ? text.unfavorite : text.favorite}
          title={project.isFavorite ? text.unfavorite : text.favorite}
        >
          <Icon name="star" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onMenu();
          }}
          className="grid h-10 w-10 place-items-center rounded-[14px] border border-white/70 bg-white/62 transition duration-200 ease-out hover:-translate-y-0.5"
          aria-label={`Действия проекта: ${project.name}`}
          title="Действия"
        >
          <Icon name="more" />
        </button>

        {menuOpen ? (
          <div
            className="absolute right-0 top-12 z-20 w-52 rounded-[20px] border border-white/70 bg-white/82 p-2 backdrop-blur-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <MenuAction testId={`rename-project-${project.id}`} onClick={() => onRename(project)} icon="edit">
              {text.rename}
            </MenuAction>
            <MenuAction testId={`duplicate-project-${project.id}`} onClick={() => onDuplicate(project.id)} icon="copy">
              {text.duplicate}
            </MenuAction>
            <MenuAction onClick={() => onPin(project)} icon="pin">
              {project.isPinned ? text.unpin : text.pin}
            </MenuAction>
            <MenuAction onClick={() => onArchive(project)} icon="archive">
              {project.isArchived ? text.restoreProject : text.archiveProject}
            </MenuAction>
            <MenuAction onClick={() => onExport(project)} icon="download">
              {text.exportProject}
            </MenuAction>
            <MenuAction danger testId={`delete-project-${project.id}`} onClick={() => onDelete(project)} icon="trash">
              {text.delete}
            </MenuAction>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ProjectPreview({ project }: { project: FormiqProjectData }) {
  const shade = project.isFavorite ? "rgba(34,158,217,0.16)" : "rgba(37,99,235,0.10)";

  return (
    <div
      className="relative flex h-full w-full items-center overflow-hidden bg-[linear-gradient(135deg,rgba(241,245,249,0.95)_0%,rgba(223,242,250,0.9)_48%,rgba(229,238,246,0.95)_100%)]"
      style={{ boxShadow: `inset 0 0 0 1px ${shade}` }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(34,158,217,0.16),transparent_22%),radial-gradient(circle_at_82%_78%,rgba(37,99,235,0.10),transparent_25%)]" />
      <div className="absolute left-3 top-2 h-10 w-20 rounded-[12px] border border-white/80 bg-white/55 backdrop-blur-sm" />
      <div className="absolute left-9 top-11 h-6 w-28 rounded-[12px] border border-white/70 bg-white/50" />
      <div className="absolute right-3 top-3 h-4 w-14 rounded-full bg-[#229ED9]/12" />
      <div className="absolute inset-x-0 bottom-0 h-7 bg-[linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.7)_100%)]" />
      <div className="absolute left-4 bottom-3 h-2.5 w-20 rounded-full bg-white/70" />
      <div className="absolute right-4 bottom-3 h-2.5 w-12 rounded-full bg-[#229ED9]/18" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.08)_46%,transparent_100%)]" />
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "14px 16px" }} className="min-h-[68px] rounded-[16px] border border-white/60 bg-white/55 backdrop-blur-3xl">
      <p className="text-[12px] font-medium text-[#64748B]">{label}</p>
      <p className="mt-1 truncate text-[16px] font-semibold text-[#0F172A]">{value}</p>
    </div>
  );
}

function SegmentedFilters({
  activeFilter,
  onChange,
}: {
  activeFilter: ProjectFilter;
  onChange: (filter: ProjectFilter) => void;
}) {
  const items: Array<{ value: ProjectFilter; label: string }> = [
    { value: "all", label: text.allProjects },
    { value: "favorites", label: text.favorites },
    { value: "recent", label: text.recent },
    { value: "archive", label: text.archive },
  ];

  return (
    <div className="inline-flex min-h-9 flex-wrap items-center gap-1 rounded-[12px] border border-white/70 bg-white/55 p-1 backdrop-blur-3xl">
      {items.map((item) => {
        const active = activeFilter === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`h-9 rounded-[12px] px-4 text-[13px] font-semibold transition duration-200 ease-out hover:-translate-y-0.5 ${
              active ? "bg-[#229ED9]/10 text-[#229ED9]" : "text-[#64748B] hover:bg-white/50"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function ViewToggle({ value, onChange }: { value: ProjectViewMode; onChange: (value: ProjectViewMode) => void }) {
  return (
    <div className="inline-flex h-10 items-center rounded-[14px] border border-white/70 bg-white/55 p-1 backdrop-blur-3xl">
      <button
        type="button"
        onClick={() => onChange("list")}
        className={`grid h-8 w-8 place-items-center rounded-[12px] transition duration-200 ease-out ${
          value === "list" ? "bg-[#229ED9]/10 text-[#229ED9]" : "text-[#64748B]"
        }`}
        aria-label="Список"
      >
        <Icon name="list" />
      </button>
      <button
        type="button"
        onClick={() => onChange("grid")}
        className={`grid h-8 w-8 place-items-center rounded-[12px] transition duration-200 ease-out ${
          value === "grid" ? "bg-[#229ED9]/10 text-[#229ED9]" : "text-[#64748B]"
        }`}
        aria-label="Сетка"
      >
        <Icon name="grid" />
      </button>
    </div>
  );
}

function ProjectEmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-white/70 bg-white/35 px-6 text-center">
      <div className="max-w-md">
        <h3 className="text-base font-semibold text-[#0F172A]">{title}</h3>
        <p className="mt-2 text-[13px] leading-6 text-[#64748B]">{description}</p>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="inline-flex h-[46px] items-center gap-2 rounded-[14px] bg-[#229ED9] px-5 text-sm font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5"
      >
        <Icon name="plus" />
        {actionLabel}
      </button>
    </div>
  );
}

function ProjectListSkeleton() {
  return (
    <div className="mt-3 space-y-2" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="grid min-h-[84px] grid-cols-[124px_minmax(0,1fr)_120px_96px] gap-4 rounded-[16px] border border-white/50 bg-white/45 p-2.5"
        >
          <div className="rounded-[10px] bg-white/80" />
          <div className="flex flex-col justify-center gap-2">
            <div className="h-4 w-1/2 rounded-full bg-white/80" />
            <div className="h-3 w-3/4 rounded-full bg-white/70" />
            <div className="h-3 w-2/3 rounded-full bg-white/70" />
          </div>
          <div className="flex flex-col justify-center gap-2">
            <div className="h-3 w-20 rounded-full bg-white/70" />
            <div className="h-3 w-16 rounded-full bg-white/70" />
          </div>
          <div className="flex items-center justify-end gap-2">
            <div className="h-9 w-9 rounded-[12px] bg-white/80" />
            <div className="h-9 w-9 rounded-[12px] bg-white/80" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectContextPanels({
  project,
  activities,
  activeSourceCount,
  inactiveSourceCount,
  errorSourceCount,
  storageBytes,
  storageLimitBytes,
  isCompact,
  onCompactChange,
  onImport,
  onExport,
  onDuplicate,
  onDelete,
}: {
  project: FormiqProjectData | null;
  activities: DashboardActivity[];
  activeSourceCount: number;
  inactiveSourceCount: number;
  errorSourceCount: number;
  storageBytes: number;
  storageLimitBytes: number;
  isCompact: boolean;
  onCompactChange: (value: boolean) => void;
  onImport: () => void;
  onExport: (project: FormiqProjectData) => void;
  onDuplicate: (projectId: string) => void;
  onDelete: (project: FormiqProjectData) => void;
}) {
  return (
    <div className="space-y-4">
      <ActionPanel
        project={project}
        onImport={onImport}
        onExport={onExport}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
      <StatusPanel
        project={project}
        activeSourceCount={activeSourceCount}
        inactiveSourceCount={inactiveSourceCount}
        errorSourceCount={errorSourceCount}
        storageBytes={storageBytes}
        storageLimitBytes={storageLimitBytes}
      />
      <ActivityPanel activities={activities} />
      <SettingsPanel isCompact={isCompact} onCompactChange={onCompactChange} />
    </div>
  );
}

function ActivityPanel({ activities }: { activities: DashboardActivity[] }) {
  return (
    <section style={contextPanelStyle} className={contextPanelClassName}>
      <h2 className="text-base font-semibold">Недавняя активность</h2>
      {activities.length ? (
        <div className="mt-4 space-y-3">
          {activities.map((activity) => (
            <div key={activity.id} className="flex min-w-0 gap-3">
              <span
                className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[12px] ${
                  activity.tone === "success"
                    ? "bg-[#22C55E]/10 text-[#16A34A]"
                    : activity.tone === "primary"
                      ? "bg-[#229ED9]/10 text-[#229ED9]"
                      : "bg-white/55 text-[#64748B]"
                }`}
              >
                <Icon name={activity.icon} />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-5 text-[#0F172A]">{activity.action}</p>
                <p className="truncate text-[13px] text-[#64748B]">{activity.projectName}</p>
                <p className="mt-0.5 text-[12px] text-[#64748B]">{formatRelativeTime(activity.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-[#64748B]">Нет операций.</p>
      )}
    </section>
  );
}

function StatusPanel({
  project,
  activeSourceCount,
  inactiveSourceCount,
  errorSourceCount,
  storageBytes,
  storageLimitBytes,
}: {
  project: FormiqProjectData | null;
  activeSourceCount: number;
  inactiveSourceCount: number;
  errorSourceCount: number;
  storageBytes: number;
  storageLimitBytes: number;
}) {
  const totalSourceCount = activeSourceCount + inactiveSourceCount + errorSourceCount;
  const lastExport = project?.exportArtifacts
    .slice()
    .sort((left, right) => getTime(right.createdAt) - getTime(left.createdAt))[0];

  return (
    <section style={contextPanelStyle} className={contextPanelClassName}>
      <h2 className="text-base font-semibold">Состояние проекта</h2>
      <div className="mt-4 grid gap-3.5 text-[13px] text-[#64748B]">
        <StatusRow label="Выбранный проект" value={project?.name ?? "Не выбран"} />
        <StatusRow label="Источники" value={`${activeSourceCount} / ${totalSourceCount}`} />
        <StatusRow label="Ошибки" value={String(errorSourceCount)} danger={errorSourceCount > 0} />
        <StatusRow label="Хранилище" value={`${formatBytes(storageBytes)} / ${formatBytes(storageLimitBytes)}`} />
        <StatusRow label="Изменён" value={project ? formatShortDate(project.metadata.updatedAt) : "—"} />
        <StatusRow label="Последний экспорт" value={lastExport ? formatShortDate(lastExport.createdAt) : "Нет"} />
      </div>
    </section>
  );
}

function ActionPanel({
  project,
  onImport,
  onExport,
  onDuplicate,
  onDelete,
}: {
  project: FormiqProjectData | null;
  onImport: () => void;
  onExport: (project: FormiqProjectData) => void;
  onDuplicate: (projectId: string) => void;
  onDelete: (project: FormiqProjectData) => void;
}) {
  return (
    <section style={contextPanelStyle} className={contextPanelClassName}>
      <h2 className="text-base font-semibold">Быстрые действия</h2>
      <div className="mt-4 space-y-1">
        <ActionButton icon="upload" onClick={onImport}>Импортировать проект</ActionButton>
        <ActionButton disabled={!project} icon="download" onClick={() => project && onExport(project)}>
          Экспортировать проект
        </ActionButton>
        <ActionButton disabled={!project} icon="copy" onClick={() => project && onDuplicate(project.id)}>
          Дублировать проект
        </ActionButton>
        <ActionButton disabled icon="grid" onClick={() => undefined}>Шаблоны проектов</ActionButton>
        <ActionButton danger disabled={!project} icon="trash" onClick={() => project && onDelete(project)}>
          Корзина
        </ActionButton>
      </div>
    </section>
  );
}

function StatusRow({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <span className="shrink-0">{label}</span>
      <span className={`min-w-0 truncate text-right font-medium ${danger ? "text-[#EF4444]" : "text-[#0F172A]"}`} title={value}>
        {value}
      </span>
    </div>
  );
}

function SettingsPanel({ isCompact, onCompactChange }: { isCompact: boolean; onCompactChange: (value: boolean) => void }) {
  return (
    <section style={contextPanelStyle} className={contextPanelClassName}>
      <h2 className="text-base font-semibold">{text.appSettings}</h2>
      <div className="mt-4 space-y-1">
        <SettingsRow icon="settings" label="Основные настройки" />
        <label className="flex min-h-10 items-center justify-between gap-3 rounded-[12px] px-2 text-sm font-medium transition duration-200 ease-out hover:bg-white/45">
          <span className="flex min-w-0 items-center gap-3">
            <Icon name="list" />
            <span>
              <span className="block">Предпочтения</span>
              <span className="block text-[12px] font-normal text-[#64748B]">Компактный список</span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={isCompact}
            onChange={(event) => onCompactChange(event.target.checked)}
            className="h-4 w-4 shrink-0 accent-[#229ED9]"
          />
        </label>
        <SettingsRow icon="archive" label="Резервные копии" />
        <SettingsRow icon="info" label="О FORMIQ" />
      </div>
    </section>
  );
}

function SidebarButton({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  icon: IconName;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 w-full items-center gap-3 rounded-[12px] px-[14px] text-sm font-medium transition duration-200 ease-out hover:-translate-y-0.5 ${
        active ? "bg-[#229ED9]/[0.08] text-[#229ED9]" : "text-[#0F172A] hover:bg-white/40"
      }`}
    >
      <Icon className="h-5 w-5" name={icon} />
      {children}
    </button>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
  hint,
  inputRef,
  compact,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hint?: string;
  inputRef?: { current: HTMLInputElement | null };
  compact?: boolean;
}) {
  return (
    <label className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" name="search" />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-[14px] border border-white/70 bg-white/62 pl-10 text-[13px] outline-none backdrop-blur-3xl transition focus:border-[#229ED9]/60 ${
          compact ? "h-10" : "h-[46px]"
        } ${
          hint ? "pr-28" : "pr-3"
        }`}
      />
      {hint ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-[10px] border border-white/70 bg-white/70 px-2 py-1 text-[11px] font-semibold text-[#64748B]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function Modal({
  title,
  titleId,
  children,
  onClose,
}: {
  title: string;
  titleId: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/35 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="w-full max-w-xl rounded-[20px] border border-white/70 bg-white/78 p-6 backdrop-blur-3xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-2xl font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-[14px] border border-white/70 bg-white/62 text-[#64748B] transition hover:-translate-y-0.5"
            aria-label="Закрыть"
          >
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-[13px] font-medium text-[#64748B]">
      {label}
      {children}
    </label>
  );
}

function ModalActions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex justify-end gap-3">{children}</div>;
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/70 bg-white/55 px-2.5 py-1 text-[12px] font-medium text-[#64748B]">
      {children}
    </span>
  );
}

function ActionButton({
  icon,
  danger,
  disabled,
  children,
  onClick,
}: {
  icon: IconName;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-11 w-full items-center gap-3 rounded-[14px] px-2 text-sm font-medium transition duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 ${
        danger ? "text-[#EF4444]" : "text-[#0F172A]"
      }`}
    >
      <Icon name={icon} />
      {children}
    </button>
  );
}

function MenuAction({
  icon,
  danger,
  testId,
  children,
  onClick,
}: {
  icon: IconName;
  danger?: boolean;
  testId?: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`flex h-10 w-full items-center gap-3 rounded-[14px] px-3 text-left text-[13px] font-medium transition hover:bg-white/55 ${
        danger ? "text-[#EF4444]" : "text-[#0F172A]"
      }`}
    >
      <Icon name={icon} />
      {children}
    </button>
  );
}

function SettingsRow({ icon, label }: { icon: IconName; label: string }) {
  return (
    <button
      type="button"
      className="flex h-10 w-full items-center gap-3 rounded-[12px] px-2 text-left text-sm font-medium transition duration-200 ease-out hover:bg-white/45"
    >
      <Icon name={icon} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Icon className="-rotate-90 text-[#64748B]" name="chevron" />
    </button>
  );
}

function IconButton({ icon, label }: { icon: IconName; label: string }) {
  return (
    <button
      type="button"
      className="grid h-11 w-11 place-items-center rounded-[14px] border border-white/70 bg-white/62 backdrop-blur-3xl transition duration-200 ease-out hover:-translate-y-0.5"
      aria-label={label}
    >
      <Icon name={icon} />
    </button>
  );
}

type IconName =
  | "archive"
  | "bell"
  | "chevron"
  | "clock"
  | "context"
  | "copy"
  | "download"
  | "edit"
  | "grid"
  | "info"
  | "list"
  | "more"
  | "pin"
  | "plus"
  | "search"
  | "settings"
  | "star"
  | "sun"
  | "trash"
  | "upload"
  | "x";

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    archive: <path d="M4 7h16M6 7v11h12V7M9 11h6M5 4h14v3H5z" />,
    bell: <path d="M6 16h12l-2-3V9a4 4 0 0 0-8 0v4l-2 3Zm4 3h4" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    clock: <path d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
    context: <path d="M4 5h16M4 12h10M4 19h16M18 9v6m-3-3h6" />,
    copy: <path d="M8 8h10v10H8zM6 16H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />,
    download: <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 20h14" />,
    edit: <path d="m4 16-.5 4 4-.5L18 9l-3.5-3.5L4 16Zm10.5-10.5L18 2l4 4-3.5 3.5" />,
    grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
    info: <path d="M12 11v5m0-8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
    list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
    more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
    pin: <path d="m14 4 6 6-4 1-4 7-2-2 7-4 1-4-6-6 2 2ZM8 16l-4 4" />,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <path d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />,
    settings: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v3m0 12v3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M1 12h3m16 0h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    sun: <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8L17 7m-10 10-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />,
    trash: <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />,
    upload: <path d="M12 20V10m0 0-4 4m4-4 4 4M5 4h14" />,
    x: <path d="m6 6 12 12M18 6 6 18" />,
  };

  return (
    <svg
      className={`h-4 w-4 shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

const inputClassName =
  "h-11 rounded-[14px] border border-white/70 bg-white/62 px-3 text-sm text-[#0F172A] outline-none backdrop-blur-3xl transition focus:border-[#229ED9]/60";
const contextPanelClassName =
  "rounded-[20px] border border-[rgba(255,255,255,0.35)] bg-white/62 p-5 text-[#0F172A] shadow-none backdrop-blur-3xl";
const contextPanelStyle = { padding: 20 };
const primaryButtonClassName =
  "inline-flex h-11 min-w-[140px] items-center justify-center whitespace-nowrap rounded-[14px] bg-[#229ED9] px-5 text-sm font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClassName =
  "inline-flex h-11 min-w-[88px] items-center justify-center whitespace-nowrap rounded-[14px] border border-white/70 bg-white/62 px-4 text-sm font-semibold transition duration-200 ease-out hover:-translate-y-0.5";

function exportProjectFile(project: FormiqProjectData) {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${toFileName(project.name)}.formiq`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function compareProjects(left: FormiqProjectData, right: FormiqProjectData, sortBy: ProjectSort): number {
  if (left.isPinned !== right.isPinned) {
    return left.isPinned ? -1 : 1;
  }

  if (sortBy === "name") {
    return left.name.localeCompare(right.name, "ru");
  }

  if (sortBy === "size") {
    return getProjectSize(right) - getProjectSize(left);
  }

  if (sortBy === "lastOpened") {
    return getTime(right.lastOpenedAt ?? right.metadata.updatedAt) - getTime(left.lastOpenedAt ?? left.metadata.updatedAt);
  }

  return getTime(right.metadata.updatedAt) - getTime(left.metadata.updatedAt);
}

function parseTags(value?: string | string[]): string[] {
  const tags = Array.isArray(value) ? value : (value ?? "").split(",");

  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 12);
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function getProjectSize(project: FormiqProjectData): number {
  return new Blob([JSON.stringify(project)]).size;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    const gigabytes = bytes / 1024 / 1024 / 1024;
    return `${Number.isInteger(gigabytes) ? gigabytes.toFixed(0) : gigabytes.toFixed(1)} ГБ`;
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} КБ`;
  }

  return `${bytes} Б`;
}

function formatProjectCount(count: number): string {
  if (count === 1) return "проект";
  if (count >= 2 && count <= 4) return "проекта";
  return "проектов";
}

function buildDashboardActivity(project: FormiqProjectData | null): DashboardActivity[] {
  if (!project) return [];

  const historyActivities: DashboardActivity[] = project.history.map((operation) => ({
    id: operation.id,
    action: getOperationAction(operation.type, operation.label),
    projectName: project.name,
    createdAt: operation.createdAt,
    icon: operation.type === "project-created" ? "plus" : operation.type === "project-opened" ? "context" : "clock",
    tone: operation.type === "project-created" || operation.type === "project-opened" ? "primary" : "neutral",
  }));

  const exportActivities: DashboardActivity[] = project.exportArtifacts.map((artifact) => ({
    id: `export-${artifact.id}`,
    action: "Выполнен экспорт",
    projectName: project.name,
    createdAt: artifact.createdAt,
    icon: "download",
    tone: "success",
  }));

  if (project.lastOpenedAt && !project.history.some((operation) => operation.type === "project-opened")) {
    historyActivities.push({
      id: `opened-${project.id}`,
      action: "Проект открыт",
      projectName: project.name,
      createdAt: project.lastOpenedAt,
      icon: "context",
      tone: "primary",
    });
  }

  if (!project.history.some((operation) => operation.type === "project-created")) {
    historyActivities.push({
      id: `created-${project.id}`,
      action: "Проект создан",
      projectName: project.name,
      createdAt: project.metadata.createdAt,
      icon: "plus",
      tone: "primary",
    });
  }

  return [...historyActivities, ...exportActivities]
    .sort((left, right) => getTime(right.createdAt) - getTime(left.createdAt))
    .slice(0, 5);
}

function getOperationAction(type: FormiqProjectData["history"][number]["type"], fallback: string): string {
  const labels: Partial<Record<FormiqProjectData["history"][number]["type"], string>> = {
    "project-created": "Проект создан",
    "project-opened": "Проект открыт",
    "data-imported": "Импортированы данные",
    "analysis-built": "Выполнен анализ",
    "thematic-map-built": "Создана тематическая карта",
    "project-settings-updated": "Обновлены настройки",
  };

  return labels[type] ?? fallback;
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2000) return "дата не указана";

  const deltaMs = date.getTime() - Date.now();
  const absoluteMs = Math.abs(deltaMs);
  const formatter = new Intl.RelativeTimeFormat("ru-RU", { numeric: "auto" });

  if (absoluteMs < 60 * 1000) return "только что";
  if (absoluteMs < 60 * 60 * 1000) return formatter.format(Math.round(deltaMs / (60 * 1000)), "minute");
  if (absoluteMs < 24 * 60 * 60 * 1000) return formatter.format(Math.round(deltaMs / (60 * 60 * 1000)), "hour");
  if (absoluteMs < 7 * 24 * 60 * 60 * 1000) return formatter.format(Math.round(deltaMs / (24 * 60 * 60 * 1000)), "day");
  return formatShortDate(value);
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2000) return "—";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(date);
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getTime(value: string): number {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function toFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "formiq-project";
}
