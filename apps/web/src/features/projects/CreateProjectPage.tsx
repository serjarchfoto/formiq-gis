"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/store/project";
import type { FormiqProjectData } from "@/types/formiq";

const text = {
  title: "FORMIQ \u2013 GIS \u043f\u043b\u0430\u0442\u0444\u043e\u0440\u043c\u0430 \u0434\u043b\u044f \u0430\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u043e\u0440\u043e\u0432",
  eyebrow: "FORMIQ workspace",
  intro:
    "\u0421\u043e\u0437\u0434\u0430\u0432\u0430\u0439\u0442\u0435 \u0438 \u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0439\u0442\u0435 \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0435 GIS-\u043f\u0440\u043e\u0435\u043a\u0442\u044b. \u0414\u0430\u043d\u043d\u044b\u0435 \u0445\u0440\u0430\u043d\u044f\u0442\u0441\u044f \u0432 IndexedDB \u0438 \u043e\u0441\u0442\u0430\u044e\u0442\u0441\u044f \u043c\u0435\u0436\u0434\u0443 \u0441\u0435\u0441\u0441\u0438\u044f\u043c\u0438.",
  manager: "\u041c\u0435\u043d\u0435\u0434\u0436\u0435\u0440 \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432",
  createProject: "\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043f\u0440\u043e\u0435\u043a\u0442",
  createNewProject: "+ \u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043f\u0440\u043e\u0435\u043a\u0442",
  empty: "\u0421\u043e\u0437\u0434\u0430\u0439\u0442\u0435 \u043d\u043e\u0432\u044b\u0439 \u043f\u0440\u043e\u0435\u043a\u0442",
  loading: "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432...",
  name: "\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435",
  description: "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435",
  city: "\u0413\u043e\u0440\u043e\u0434",
  author: "\u0410\u0432\u0442\u043e\u0440",
  crs: "\u0421\u041a",
  units: "\u0415\u0434\u0438\u043d\u0438\u0446\u044b",
  requiredName: "\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u043f\u0440\u043e\u0435\u043a\u0442\u0430 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e.",
  createError:
    "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u043f\u0440\u043e\u0435\u043a\u0442. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0435 \u0440\u0430\u0437.",
  renameError:
    "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0435\u0440\u0435\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u0442\u044c \u043f\u0440\u043e\u0435\u043a\u0442.",
  open: "\u041e\u0442\u043a\u0440\u044b\u0442\u044c",
  rename: "\u041f\u0435\u0440\u0435\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u0442\u044c",
  duplicate: "\u0414\u0443\u0431\u043b\u0438\u0440\u043e\u0432\u0430\u0442\u044c",
  delete: "\u0423\u0434\u0430\u043b\u0438\u0442\u044c",
  deleteConfirm:
    "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u043f\u0440\u043e\u0435\u043a\u0442? \u042d\u0442\u043e \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043d\u0435\u043b\u044c\u0437\u044f \u043e\u0442\u043c\u0435\u043d\u0438\u0442\u044c.",
  deleteTitle: "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u043f\u0440\u043e\u0435\u043a\u0442",
  deleteBody:
    "\u041f\u0440\u043e\u0435\u043a\u0442 \u0438\u0441\u0447\u0435\u0437\u043d\u0435\u0442 \u0438\u0437 \u0441\u043f\u0438\u0441\u043a\u0430 \u0438 \u0431\u0443\u0434\u0435\u0442 \u0443\u0434\u0430\u043b\u0435\u043d \u0438\u0437 IndexedDB.",
  renameTitle: "\u041f\u0435\u0440\u0435\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u0442\u044c \u043f\u0440\u043e\u0435\u043a\u0442",
  cancel: "\u041e\u0442\u043c\u0435\u043d\u0430",
  ok: "OK",
  close: "\u0417\u0430\u043a\u0440\u044b\u0442\u044c",
  creating: "\u0421\u043e\u0437\u0434\u0430\u043d\u0438\u0435...",
  territories: "\u0442\u0435\u0440\u0440\u0438\u0442\u043e\u0440\u0438\u0439",
  layers: "\u0441\u043b\u043e\u0435\u0432",
  modified: "\u0418\u0437\u043c\u0435\u043d\u0435\u043d",
  noCity: "\u0413\u043e\u0440\u043e\u0434 \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d",
};

const initialForm = {
  name: "",
  description: "",
  city: "",
  author: "",
  crs: "WGS84",
  units: "m" as const,
};

export default function CreateProjectPage() {
  const router = useRouter();
  const projects = useProjectStore((state) => state.projects);
  const createProject = useProjectStore((state) => state.createProject);
  const loadAll = useProjectStore((state) => state.loadAll);
  const openProject = useProjectStore((state) => state.openProject);
  const updateProject = useProjectStore((state) => state.updateProject);
  const duplicateProject = useProjectStore((state) => state.duplicateProject);
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [renamingProject, setRenamingProject] = useState<FormiqProjectData | null>(null);
  const [deletingProject, setDeletingProject] = useState<FormiqProjectData | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [renameError, setRenameError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sortedProjects = useMemo(
    () =>
      [...projects].sort((left, right) =>
        right.metadata.updatedAt.localeCompare(left.metadata.updatedAt)
      ),
    [projects]
  );

  useEffect(() => {
    let isMounted = true;

    loadAll()
      .catch(() => undefined)
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [loadAll]);

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
      const project = await createProject(form);
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

  const startRename = (project: FormiqProjectData) => {
    setRenamingProject(project);
    setRenameValue(project.name);
    setRenameError("");
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

    setRenamingProject(null);
    setRenameValue("");
  };

  const confirmDelete = async () => {
    if (!deletingProject) {
      return;
    }

    await deleteProject(deletingProject.id);
    setDeletingProject(null);
  };

  return (
    <main className="min-h-screen bg-[#F6F8FB] text-[#111827]">
      <section className="px-6 py-10">
        <div className="mx-auto w-full max-w-6xl">
          <div className="flex flex-col gap-6 border-b border-[#E5E7EB] pb-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-[#229ED9]">
                {text.eyebrow}
              </p>

              <h1 className="max-w-3xl text-4xl font-bold leading-tight text-[#111827] sm:text-5xl">
                {text.title}
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-7 text-[#4B5563]">{text.intro}</p>
            </div>

            <button
              type="button"
              data-testid="create-project-button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex h-12 items-center justify-center rounded-lg bg-[#229ED9] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#178AC2] focus:outline-none focus:ring-4 focus:ring-[#BAE6FD]"
            >
              {text.createNewProject}
            </button>
          </div>

          <section className="pt-8" aria-labelledby="project-list-title">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 id="project-list-title" className="text-xl font-semibold">
                {text.manager}
              </h2>
            </div>

            {isLoading ? (
              <p className="rounded-lg border border-dashed border-[#CBD5E1] bg-white p-8 text-sm text-[#64748B]">
                {text.loading}
              </p>
            ) : sortedProjects.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#CBD5E1] bg-white p-8 text-sm text-[#64748B]">
                {text.empty}
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="project-list">
                {sortedProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onOpen={handleOpenProject}
                    onRename={startRename}
                    onDuplicate={duplicateProject}
                    onDelete={setDeletingProject}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </section>

      {isCreateModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-project-title"
          data-testid="create-project-dialog"
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl"
          >
            <ModalHeader
              title={text.createProject}
              onClose={() => setIsCreateModalOpen(false)}
            />

            <div className="mt-6 grid gap-4">
              <Field label={text.name}>
                <input
                  data-testid="create-project-name"
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  required
                  autoFocus
                  className="h-11 rounded-lg border border-[#D1D5DB] px-3 text-sm outline-none transition focus:border-[#229ED9] focus:ring-4 focus:ring-[#E0F2FE]"
                />
              </Field>

              <Field label={text.description}>
                <textarea
                  data-testid="create-project-description"
                  value={form.description}
                  onChange={(event) => updateField("description", event.target.value)}
                  rows={3}
                  className="resize-none rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm outline-none transition focus:border-[#229ED9] focus:ring-4 focus:ring-[#E0F2FE]"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={text.city}>
                  <input
                    data-testid="create-project-city"
                    value={form.city}
                    onChange={(event) => updateField("city", event.target.value)}
                    className="h-11 rounded-lg border border-[#D1D5DB] px-3 text-sm outline-none transition focus:border-[#229ED9] focus:ring-4 focus:ring-[#E0F2FE]"
                  />
                </Field>

                <Field label={text.author}>
                  <input
                    data-testid="create-project-author"
                    value={form.author}
                    onChange={(event) => updateField("author", event.target.value)}
                    className="h-11 rounded-lg border border-[#D1D5DB] px-3 text-sm outline-none transition focus:border-[#229ED9] focus:ring-4 focus:ring-[#E0F2FE]"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={text.crs}>
                  <select
                    value={form.crs}
                    onChange={(event) => updateField("crs", event.target.value)}
                    className="h-11 rounded-lg border border-[#D1D5DB] bg-white px-3 text-sm outline-none transition focus:border-[#229ED9] focus:ring-4 focus:ring-[#E0F2FE]"
                  >
                    <option value="WGS84">WGS84</option>
                  </select>
                </Field>

                <Field label={text.units}>
                  <select
                    value={form.units}
                    onChange={(event) => updateField("units", event.target.value)}
                    className="h-11 rounded-lg border border-[#D1D5DB] bg-white px-3 text-sm outline-none transition focus:border-[#229ED9] focus:ring-4 focus:ring-[#E0F2FE]"
                  >
                    <option value="m">\u043c</option>
                  </select>
                </Field>
              </div>
            </div>

            {error ? <p className="mt-4 text-sm font-medium text-[#DC2626]">{error}</p> : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="h-11 rounded-lg border border-[#D1D5DB] px-4 text-sm font-semibold text-[#374151] transition hover:bg-[#F9FAFB]"
              >
                {text.cancel}
              </button>

              <button
                type="submit"
                data-testid="create-project-submit"
                disabled={isSubmitting}
                className="h-11 rounded-lg bg-[#229ED9] px-5 text-sm font-semibold text-white transition hover:bg-[#178AC2] disabled:cursor-not-allowed disabled:bg-[#93C5FD]"
              >
                {isSubmitting ? text.creating : text.createProject}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {renamingProject ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-project-title"
          data-testid="rename-project-dialog"
        >
          <form
            onSubmit={confirmRename}
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            <ModalHeader title={text.renameTitle} onClose={() => setRenamingProject(null)} />

            <Field label={text.name}>
              <input
                data-testid="rename-project-name"
                value={renameValue}
                onChange={(event) => {
                  setRenameValue(event.target.value);
                  setRenameError("");
                }}
                autoFocus
                className="mt-6 h-11 w-full rounded-lg border border-[#D1D5DB] px-3 text-sm outline-none transition focus:border-[#229ED9] focus:ring-4 focus:ring-[#E0F2FE]"
              />
            </Field>

            {renameError ? (
              <p className="mt-4 text-sm font-medium text-[#DC2626]">{renameError}</p>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRenamingProject(null)}
                className="h-11 rounded-lg border border-[#D1D5DB] px-4 text-sm font-semibold text-[#374151] transition hover:bg-[#F9FAFB]"
              >
                {text.cancel}
              </button>

              <button
                type="submit"
                data-testid="rename-project-submit"
                className="h-11 rounded-lg bg-[#229ED9] px-5 text-sm font-semibold text-white transition hover:bg-[#178AC2]"
              >
                {text.ok}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deletingProject ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-project-title"
          data-testid="delete-project-dialog"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <ModalHeader title={text.deleteTitle} onClose={() => setDeletingProject(null)} />

            <p className="mt-5 text-sm leading-6 text-[#4B5563]">
              {text.deleteConfirm}
            </p>
            <p className="mt-2 text-sm leading-6 text-[#4B5563]">
              {text.deleteBody}
            </p>
            <p className="mt-4 rounded-lg bg-[#F8FAFC] px-3 py-2 text-sm font-semibold text-[#111827]">
              {deletingProject.name}
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingProject(null)}
                className="h-11 rounded-lg border border-[#D1D5DB] px-4 text-sm font-semibold text-[#374151] transition hover:bg-[#F9FAFB]"
              >
                {text.cancel}
              </button>

              <button
                type="button"
                data-testid="delete-project-confirm"
                onClick={confirmDelete}
                className="h-11 rounded-lg bg-[#DC2626] px-5 text-sm font-semibold text-white transition hover:bg-[#B91C1C]"
              >
                {text.delete}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ProjectCard({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: {
  project: FormiqProjectData;
  onOpen: (projectId: string) => void;
  onRename: (project: FormiqProjectData) => void;
  onDuplicate: (projectId: string) => void;
  onDelete: (project: FormiqProjectData) => void;
}) {
  return (
    <article
      className="flex min-h-[248px] flex-col rounded-lg border border-[#E5E7EB] bg-white p-5 shadow-sm"
      data-testid={`project-card-${project.id}`}
    >
      <div className="mb-4 flex h-24 items-center justify-center rounded-lg bg-[#E0F2FE] text-3xl font-bold text-[#0369A1]">
        {getProjectInitials(project.name)}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-lg font-semibold text-[#111827]" data-testid="project-card-name">
          {project.name}
        </h3>
        <p className="mt-1 truncate text-sm text-[#64748B]">{project.city || text.noCity}</p>
        <p className="mt-3 text-xs text-[#64748B]">
          {text.modified}: {formatDate(project.metadata.updatedAt)}
        </p>
        <p className="mt-2 text-xs text-[#64748B]">
          {project.territories.length} {text.territories} · {project.layers.length} {text.layers}
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid={`open-project-${project.id}`}
          onClick={() => onOpen(project.id)}
          className="h-10 rounded-lg bg-[#229ED9] px-3 text-sm font-semibold text-white transition hover:bg-[#178AC2]"
        >
          {text.open}
        </button>
        <button
          type="button"
          data-testid={`rename-project-${project.id}`}
          onClick={() => onRename(project)}
          className="h-10 rounded-lg border border-[#D1D5DB] px-3 text-sm font-semibold text-[#374151] transition hover:bg-[#F8FAFC]"
        >
          {text.rename}
        </button>
        <button
          type="button"
          data-testid={`duplicate-project-${project.id}`}
          onClick={() => onDuplicate(project.id)}
          className="h-10 rounded-lg border border-[#D1D5DB] px-3 text-sm font-semibold text-[#374151] transition hover:bg-[#F8FAFC]"
        >
          {text.duplicate}
        </button>
        <button
          type="button"
          data-testid={`delete-project-${project.id}`}
          onClick={() => onDelete(project)}
          className="h-10 rounded-lg border border-[#FCA5A5] px-3 text-sm font-semibold text-[#B91C1C] transition hover:bg-[#FEF2F2]"
        >
          {text.delete}
        </button>
      </div>
    </article>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const titleId =
    title === text.renameTitle
      ? "rename-project-title"
      : title === text.deleteTitle
        ? "delete-project-title"
        : "create-project-title";

  return (
    <div className="flex items-start justify-between gap-4">
      <h2 id={titleId} className="text-xl font-semibold">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E7EB] text-xl leading-none text-[#6B7280] transition hover:bg-[#F3F4F6]"
        aria-label={text.close}
      >
        x
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function getProjectInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
