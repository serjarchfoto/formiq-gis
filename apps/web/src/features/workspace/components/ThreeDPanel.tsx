"use client";

import { CartographicStyleEngine, Visualization3DEngine } from "@/lib";
import { useProjectStore } from "@/store/project";

const visualizationEngine = new Visualization3DEngine();
const cartographicStyleEngine = new CartographicStyleEngine();

export default function ThreeDPanel() {
  const project = useProjectStore((state) => state.project);
  const threeDStyle = cartographicStyleEngine.getThreeDStyle(project.settings.display.cartographicTheme);
  const scene = visualizationEngine.buildWhiteModelScene({
    project,
    style: threeDStyle,
  });
  const extrudedCount = scene.meshes.filter((mesh) => mesh.extrusionHeight !== null).length;

  return (
    <aside className="absolute left-6 top-6 z-20 w-[22rem] rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xl">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-[#111827]">3D</h2>
        <p className="mt-1 text-xs text-[#64748B]">Изометрия, высоты, камеры и 3D-экспорт.</p>
      </div>

      <section className="space-y-2">
        <Metric label="Здания в сцене" value={scene.meshes.length.toLocaleString("ru-RU")} />
        <Metric label="С высотой" value={extrudedCount.toLocaleString("ru-RU")} />
        <Metric label="White Model" value={project.whiteModel.status === "generated" ? "готово" : "черновик"} />
        <Metric label="Semantic 3D" value={project.semantic3D.status === "generated" ? "готово" : "не создан"} />
      </section>

      <section className="mt-5 space-y-3 border-t border-[#E5E7EB] pt-4">
        <Control label="Высота зданий" value="по этажности / OSM height" />
        <Control label="Камера" value="изометрия 60°" />
        <Control label="Тени" value="мягкие" />
        <Control label="Цвет" value="функция / материал" />
      </section>

      <button
        type="button"
        className="mt-5 h-10 w-full rounded-xl bg-[#229ED9] text-sm font-semibold text-white transition hover:bg-[#1D8CC2]"
      >
        Экспорт 3D
      </button>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm">
      <span className="text-[#6B7280]">{label}</span>
      <span className="font-semibold text-[#111827]">{value}</span>
    </div>
  );
}

function Control({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] px-3 py-2">
      <p className="text-xs font-semibold text-[#111827]">{label}</p>
      <p className="mt-1 text-xs text-[#64748B]">{value}</p>
    </div>
  );
}
