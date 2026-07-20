"use client";

import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

type AreaOption = {
  id: string;
  name: string;
  code: string;
};

export function AreaDropdown({
  areas,
  assignedAreaIds,
}: {
  areas: AreaOption[];
  assignedAreaIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set(assignedAreaIds));

  const selectedAreas = areas.filter((area) => selectedIds.has(area.id));
  const filteredAreas = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return areas;
    return areas.filter((area) =>
      [area.name, area.code].some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [areas, query]);

  function toggleArea(areaId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(areaId)) {
        next.delete(areaId);
      } else {
        next.add(areaId);
      }
      return next;
    });
  }

  function clearAreas() {
    setSelectedIds(new Set());
  }

  return (
    <div className="relative">
      {[...selectedIds].map((areaId) => (
        <input key={areaId} type="hidden" name="area_ids" value={areaId} />
      ))}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-[#cbd7e3] bg-white px-3 py-2 text-right text-sm font-black text-[#172033] shadow-sm transition duration-200 hover:border-[#0b559f] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b559f]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-[#0b559f]" aria-hidden="true" />
          <span className="truncate">
            {selectedAreas.length ? selectedAreas.map((area) => area.name).join("، ") : "اختر المناطق المسؤولة"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {selectedAreas.length ? (
            <span className="rounded-lg bg-[#eef6ff] px-2 py-1 text-xs font-black text-[#0b559f]">
              {selectedAreas.length.toLocaleString("ar-EG")}
            </span>
          ) : null}
          <ChevronDown className={`h-4 w-4 text-[#607086] transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
      </button>

      {selectedAreas.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedAreas.map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => toggleArea(area.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] px-2.5 py-1.5 text-xs font-black text-[#0b559f] transition hover:border-[#0b559f] hover:bg-white"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{area.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="mt-2 w-full min-w-[280px] overflow-hidden rounded-lg border border-[#cbd7e3] bg-white shadow-xl">
          <div className="border-b border-[#e2e8ef] p-2">
            <label className="flex items-center gap-2 rounded-lg border border-[#dbe3ea] bg-[#f8fafc] px-2.5 py-2 text-sm font-bold text-[#607086]">
              <Search className="h-4 w-4" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="بحث عن منطقة"
                className="w-full bg-transparent text-[#172033] outline-none placeholder:text-[#8a98aa]"
              />
            </label>
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            {filteredAreas.map((area) => {
              const selected = selectedIds.has(area.id);
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => toggleArea(area.id)}
                  className={
                    selected
                      ? "mb-1 flex w-full items-center justify-between gap-3 rounded-lg bg-[#eef6ff] px-3 py-2.5 text-right text-sm font-black text-[#0b559f] transition hover:bg-[#e3f1ff]"
                      : "mb-1 flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-right text-sm font-bold text-[#324155] transition hover:bg-[#f4f7fa] hover:text-[#0b559f]"
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate">{area.name}</span>
                    <span className="block truncate text-xs font-bold text-[#607086]">{area.code}</span>
                  </span>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${selected ? "border-[#0b559f] bg-[#0b559f] text-white" : "border-[#cbd7e3] bg-white text-transparent"}`}>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </button>
              );
            })}
            {!filteredAreas.length ? (
              <p className="px-3 py-5 text-center text-sm font-bold text-[#607086]">لا توجد منطقة بهذا الاسم.</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[#e2e8ef] bg-[#fbfcfd] p-2">
            <button
              type="button"
              onClick={clearAreas}
              className="rounded-lg px-3 py-2 text-xs font-black text-[#c1121f] transition hover:bg-[#fff1f2]"
            >
              مسح الاختيار
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-[#0b559f] px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-[#0a3f78]"
            >
              تم
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
