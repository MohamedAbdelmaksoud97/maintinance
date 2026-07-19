"use client";

import { adminCompletePlannedTaskGroupAction } from "@/app/auth/actions";
import { adminUncompletePlannedTaskGroupAction } from "@/app/auth/actions";
import { useFormStatus } from "react-dom";

export function AdminCompleteToggle({
  taskIds,
  scheduledDate,
  isCompleted,
  canReopen,
}: {
  taskIds: string[];
  scheduledDate: string;
  isCompleted: boolean;
  canReopen: boolean;
}) {
  return (
    <form
      action={isCompleted ? adminUncompletePlannedTaskGroupAction : adminCompletePlannedTaskGroupAction}
      onClick={(event) => event.stopPropagation()}
      className="shrink-0"
    >
      <input type="hidden" name="return_date" value={scheduledDate} />
      {taskIds.map((taskId) => (
        <input key={taskId} type="hidden" name="task_ids" value={taskId} />
      ))}
      <ToggleButton isCompleted={isCompleted} canReopen={canReopen} />
    </form>
  );
}

function ToggleButton({ isCompleted, canReopen }: { isCompleted: boolean; canReopen: boolean }) {
  const { pending } = useFormStatus();
  const disabled = pending || (isCompleted && !canReopen);
  const label = isCompleted ? (canReopen ? "إرجاع إلى غير مكتمل" : "مكتملة بواسطة العامل") : "اعتبار المهمة تمت";

  return (
    <button
      type="submit"
      disabled={disabled}
      aria-busy={pending}
      aria-pressed={isCompleted}
      aria-label={label}
      title={label}
      className={
        isCompleted
          ? "group/toggle inline-flex h-10 min-w-[132px] items-center justify-between gap-2 rounded-full border border-[#98d8ad] bg-[#eef9f2] px-2 shadow-sm transition hover:border-[#0f6b36] hover:bg-[#e3f5e9] disabled:cursor-not-allowed disabled:opacity-70"
          : "group/toggle inline-flex h-10 min-w-[132px] items-center justify-between gap-2 rounded-full border border-[#bdd6ee] bg-white px-2 shadow-sm transition hover:border-[#207a45] hover:bg-[#eef9f2] disabled:cursor-wait disabled:opacity-70"
      }
    >
      <span className={`px-2 text-xs font-black ${isCompleted ? "text-[#207a45]" : "text-[#607086]"}`}>
        {pending ? "جاري..." : isCompleted ? "مكتملة" : "غير مكتملة"}
      </span>
      <span
        className={
          isCompleted
            ? "grid h-7 w-7 place-items-center rounded-full bg-[#207a45] text-xs font-black text-white shadow-sm transition group-hover/toggle:bg-[#0f6b36]"
            : "grid h-7 w-7 place-items-center rounded-full bg-[#dbe8f6] text-xs font-black text-[#0b559f] shadow-sm transition group-hover/toggle:bg-[#207a45] group-hover/toggle:text-white"
        }
      >
        {pending ? "..." : isCompleted ? "✓" : ""}
      </span>
    </button>
  );
}
