"use server";

import { createClient } from "@/utils/supabase/server";
import { getSaudiToday } from "@/utils/operational-time";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

function encoded(message: string) {
  return encodeURIComponent(message);
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function selectedValues(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function toSaudiTimestamp(value: string | null) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return `${value}:00+03:00`;
  return value;
}

async function uploadTaskPhotos(supabase: ReturnType<typeof createClient>, prefix: string, photos: FormDataEntryValue[]) {
  const uploadedPaths: string[] = [];
  for (const [index, photo] of photos.entries()) {
    if (typeof photo === "string" || !photo || !("size" in photo) || photo.size === 0) continue;
    const file = photo as File;
    const path = `${prefix}/${Date.now()}-${index}-${safeFileName(file.name)}`;
    const { error } = await supabase.storage.from("maintenance-photos").upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (error) {
      throw new Error(error.message);
    }
    uploadedPaths.push(path);
  }
  return uploadedPaths;
}

export async function signUpAction(formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const origin = (await headers()).get("origin") ?? "";
  const supabase = createClient(await cookies());

  if (!fullName || !email || password.length < 6) {
    redirect(`/auth/register?message=${encoded("اكتب الاسم والبريد وكلمة مرور لا تقل عن 6 أحرف")}`);
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/auth/register?message=${encoded(error.message)}`);
  }

  redirect(`/auth/login?message=${encoded("تم إنشاء الحساب. افتح البريد لتأكيد الإيميل، ثم انتظر اعتماد المدير.")}`);
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = createClient(await cookies());

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/auth/login?message=${encoded("بيانات الدخول غير صحيحة أو الحساب لم يتم تأكيده بعد")}`);
  }

  redirect("/");
}

export async function resetPasswordAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const origin = (await headers()).get("origin") ?? "";
  const supabase = createClient(await cookies());

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback`,
  });

  if (error) {
    redirect(`/auth/reset-password?message=${encoded(error.message)}`);
  }

  redirect(`/auth/login?message=${encoded("تم إرسال رابط استرجاع كلمة المرور على البريد")}`);
}

export async function signOutAction() {
  const supabase = createClient(await cookies());
  await supabase.auth.signOut();
  redirect("/auth/login");
}

export async function approveWorkerAction(formData: FormData) {
  const profileId = String(formData.get("profile_id") ?? "");
  const workerId = optionalText(formData.get("worker_id"));
  const approve = String(formData.get("approve") ?? "true") === "true";
  const areaIds = selectedValues(formData, "area_ids");
  const supabase = createClient(await cookies());

  const { error } = await supabase.rpc("approve_worker", {
    worker_profile_id: profileId,
    approve,
  });

  if (error) {
    redirect(`/admin/workers?message=${encoded(error.message)}`);
  }

  if (approve && workerId) {
    const areaResult = await saveWorkerAreas(supabase, workerId, areaIds);
    if (areaResult) {
      redirect(`/admin/workers?message=${encoded(areaResult)}`);
    }
  }

  redirect(`/admin/workers?message=${encoded(approve ? "تم اعتماد العامل" : "تم رفض العامل")}`);
}

export async function updateWorkerAreasAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const workerId = String(formData.get("worker_id") ?? "");
  const areaIds = selectedValues(formData, "area_ids");

  const message = await saveWorkerAreas(supabase, workerId, areaIds);
  if (message) {
    redirect(`/admin/workers?message=${encoded(message)}`);
  }

  redirect(`/admin/workers?message=${encoded("تم حفظ مناطق العامل وتحديث مهام الخطة")}`);
}

async function saveWorkerAreas(supabase: ReturnType<typeof createClient>, workerId: string, areaIds: string[]) {
  if (!workerId) return "تعذر تحديد العامل";

  const { error: deleteWorkerAreasError } = await supabase
    .from("worker_area_assignments")
    .delete()
    .eq("worker_id", workerId);
  if (deleteWorkerAreasError) return deleteWorkerAreasError.message;

  if (areaIds.length) {
    const { error: deleteMovedAreasError } = await supabase
      .from("worker_area_assignments")
      .delete()
      .in("area_id", areaIds);
    if (deleteMovedAreasError) return deleteMovedAreasError.message;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from("worker_area_assignments").insert(
      areaIds.map((areaId) => ({
        worker_id: workerId,
        area_id: areaId,
        assigned_by: user?.id ?? null,
      })),
    );
    if (insertError) return insertError.message;

    await supabase.from("workers").update({ default_area_id: areaIds[0] }).eq("id", workerId);
  } else {
    await supabase.from("workers").update({ default_area_id: null }).eq("id", workerId);
  }

  const { error: refreshError } = await supabase.rpc("refresh_area_worker_task_assignments", {
    target_start: getSaudiToday(),
  });
  if (refreshError) return refreshError.message;

  revalidatePath("/admin/workers");
  revalidatePath("/admin/planned-tasks");
  revalidatePath("/worker/tasks");
  return null;
}

export async function updatePlannedTaskAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const taskId = String(formData.get("task_id") ?? "");
  const workerId = optionalText(formData.get("worker_id"));
  const scheduledDate = String(formData.get("scheduled_date") ?? "").trim();
  const plannedQuantity = optionalNumber(formData.get("planned_quantity"));
  const pointName = optionalText(formData.get("point_name"));
  const taskPage = String(formData.get("page") ?? "1");
  let assignmentStatusId: string | null = null;
  const { data: currentTask } = await supabase
    .from("planned_tasks")
    .select("id,maintenance_point_id,scheduled_date,original_values")
    .eq("id", taskId)
    .maybeSingle();

  if (workerId) {
    const { data: assignmentStatus } = await supabase
      .from("assignment_statuses")
      .select("id")
      .eq("code", "ASSIGNED")
      .maybeSingle();
    assignmentStatusId = assignmentStatus?.id ?? null;
  }

  const updateTask: Record<string, string | number | null> = {
    main_worker_id: workerId,
    planned_quantity: plannedQuantity,
  };

  if (assignmentStatusId) {
    updateTask.assignment_status_id = assignmentStatusId;
  }

  if (scheduledDate) {
    updateTask.scheduled_date = scheduledDate;
  }

  const { data: task, error: taskError } = await supabase
    .from("planned_tasks")
    .update(updateTask)
    .eq("id", taskId)
    .select("maintenance_point_id")
    .single();

  if (taskError) {
    redirect(`/admin/planned-tasks?page=${taskPage}&message=${encoded(taskError.message)}`);
  }

  if (task?.maintenance_point_id && pointName) {
    await supabase
      .from("maintenance_points")
      .update({ point_name: pointName })
      .eq("id", task.maintenance_point_id);
  }

  if (task?.maintenance_point_id && scheduledDate && currentTask?.scheduled_date !== scheduledDate) {
    await supabase.rpc("prepare_maintenance_point_reschedule", {
      target_maintenance_point_id: task.maintenance_point_id,
      new_anchor_date: scheduledDate,
      keep_task_id: taskId,
      reason: "manual_reschedule",
    });
    await supabase.rpc("extend_dynamic_maintenance_plan", {
      target_start: scheduledDate,
      months_ahead: 12,
      target_maintenance_point_id: task.maintenance_point_id,
    });
  }

  revalidatePath("/admin/planned-tasks");
  revalidatePath("/worker/tasks");
  redirect(`/admin/planned-tasks?page=${taskPage}&message=${encoded("تم تحديث المهمة")}`);
}

export async function completeMaintenancePointDataAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const pointId = String(formData.get("point_id") ?? "");
  const returnTo = optionalText(formData.get("return_to")) ?? "/admin/data-completion";
  const pointName = optionalText(formData.get("point_name"));
  const lineCode = optionalText(formData.get("line_code"));
  const lastDate = optionalText(formData.get("last_date"));
  const frequencyDays = optionalNumber(formData.get("frequency_days"));
  const frequencyHours = optionalNumber(formData.get("frequency_hours"));
  const runningHours = optionalNumber(formData.get("running_hours_per_day"));
  const materialId = optionalText(formData.get("material_id"));
  const quantity = optionalNumber(formData.get("quantity"));
  const quantityUnit = optionalText(formData.get("quantity_unit"));
  const executionCondition = optionalText(formData.get("execution_condition")) ?? "configurable";

  const { data: point, error: pointError } = await supabase
    .from("maintenance_points")
    .select("id,work_type_id,original_values,maintenance_work_types(code)")
    .eq("id", pointId)
    .maybeSingle();

  if (pointError || !point) {
    redirect(`${returnTo}?message=${encoded("تعذر تحميل بيانات نقطة الصيانة")}`);
  }

  const workType = (point as unknown as { maintenance_work_types: { code: string | null } | null }).maintenance_work_types?.code;
  const originalValues = ((point.original_values as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const hasFrequency = frequencyDays !== null || frequencyHours !== null;
  const isComplete = Boolean(lastDate && hasFrequency && runningHours && runningHours > 0);
  const pointUpdate: Record<string, unknown> = {
    point_name: pointName,
    material_id: materialId,
    quantity,
    quantity_unit: quantityUnit,
    running_hours_per_day: runningHours,
    frequency_days: frequencyDays,
    frequency_hours: frequencyHours,
    execution_condition: executionCondition,
    schedule_anchor_date: lastDate,
    anchor_reason: "data_completion",
    needs_data_review: !isComplete,
    data_quality_status: isComplete ? "COMPLETE" : "MISSING_DATA",
    original_values: {
      ...originalValues,
      line_code: lineCode,
      last_date: lastDate,
      frequency_days: frequencyDays,
      frequency_hours: frequencyHours,
      running_hours_per_day: runningHours,
      data_completed_at: new Date().toISOString(),
    },
  };

  if (workType === "inspection") {
    pointUpdate.last_inspection_date = lastDate;
  } else if (workType === "greasing") {
    pointUpdate.last_grease_date = lastDate;
  } else {
    pointUpdate.last_change_date = lastDate;
  }

  const { error } = await supabase.from("maintenance_points").update(pointUpdate).eq("id", pointId);
  if (error) {
    redirect(`${returnTo}?message=${encoded(error.message)}`);
  }

  if (isComplete) {
    await supabase.rpc("extend_dynamic_maintenance_plan", {
      target_start: getSaudiToday(),
      months_ahead: 12,
      target_maintenance_point_id: pointId,
    });
  }

  revalidatePath("/admin/data-completion");
  revalidatePath("/admin/planned-tasks");
  redirect(`/admin/data-completion?message=${encoded(isComplete ? "تم استكمال البيانات وتحديث الخطة" : "تم حفظ البيانات وتبقى حقول مطلوبة")}`);
}

export async function createPlannedTaskAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const equipmentId = optionalText(formData.get("equipment_id"));
  const workTypeId = optionalText(formData.get("work_type_id"));
  const materialId = optionalText(formData.get("material_id"));
  const workerId = optionalText(formData.get("worker_id"));
  const scheduledDate = String(formData.get("scheduled_date") ?? "").trim();
  const plannedQuantity = optionalNumber(formData.get("planned_quantity"));
  const unit = optionalText(formData.get("planned_quantity_unit"));
  const pointName = optionalText(formData.get("point_name"));

  if (!equipmentId || !workTypeId || !scheduledDate) {
    redirect(`/admin/planned-tasks/new?message=${encoded("المعدة ونوع المهمة واليوم مطلوبة")}`);
  }

  const [{ data: status }, { data: unassigned }, { data: assigned }, { data: workType }] = await Promise.all([
    supabase.from("task_statuses").select("id").eq("code", "NEEDS_ASSIGNMENT").maybeSingle(),
    supabase.from("assignment_statuses").select("id").eq("code", "UNASSIGNED").maybeSingle(),
    supabase.from("assignment_statuses").select("id").eq("code", "ASSIGNED").maybeSingle(),
    supabase.from("maintenance_work_types").select("code").eq("id", workTypeId).maybeSingle(),
  ]);
  const executionCondition = ["oil_change", "grease_change"].includes(workType?.code ?? "") ? "shutdown" : "running";

  const { data: task, error } = await supabase
    .from("planned_tasks")
    .insert({
      equipment_id: equipmentId,
      work_type_id: workTypeId,
      material_id: materialId,
      status_id: status?.id,
      assignment_status_id: workerId ? assigned?.id : unassigned?.id,
      main_worker_id: workerId,
      original_due_date: scheduledDate,
      scheduled_date: scheduledDate,
      execution_condition: executionCondition,
      planned_quantity: plannedQuantity,
      planned_quantity_unit: unit,
      original_values: {
        source_mode: "manual_annual_plan",
        point_name: pointName,
      },
    })
    .select("id")
    .single();

  if (error || !task) {
    redirect(`/admin/planned-tasks/new?message=${encoded(error?.message ?? "تعذر إضافة المهمة")}`);
  }

  revalidatePath("/admin/planned-tasks");
  redirect(`/admin/planned-tasks?message=${encoded("تم إضافة مهمة جديدة للخطة")}`);
}

export async function completePlannedTaskGroupAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const taskIds = selectedValues(formData, "task_ids");
  const returnDate = optionalText(formData.get("return_date")) ?? getSaudiToday();
  const startedAt = toSaudiTimestamp(optionalText(formData.get("started_at")));
  const completedAt = toSaudiTimestamp(optionalText(formData.get("completed_at"))) ?? new Date().toISOString();
  const notes = optionalText(formData.get("notes"));

  if (!taskIds.length) {
    redirect(`/worker/tasks?date=${returnDate}&message=${encoded("لا توجد مهام داخل الكارت")}`);
  }

  let photoPaths: string[] = [];
  try {
    photoPaths = await uploadTaskPhotos(supabase, `planned/${taskIds[0]}`, formData.getAll("photos"));
  } catch (error) {
    redirect(`/worker/tasks?date=${returnDate}&message=${encoded(error instanceof Error ? error.message : "تعذر رفع الصور")}`);
  }

  const { error } = await supabase.rpc("complete_planned_task_group", {
    target_task_ids: taskIds,
    started_at_value: startedAt,
    completed_at_value: completedAt,
    notes_value: notes,
    photo_paths_value: photoPaths,
  });

  if (error) {
    redirect(`/worker/tasks?date=${returnDate}&message=${encoded(error.message)}`);
  }

  revalidatePath("/worker/tasks");
  revalidatePath("/admin/planned-tasks");
  redirect(`/worker/tasks?date=${returnDate}&message=${encoded("تم حفظ تنفيذ كارت المعدة وتحديث الخطة")}`);
}

export async function submitNonExecutionGroupAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const taskIds = selectedValues(formData, "task_ids");
  const returnDate = optionalText(formData.get("return_date")) ?? getSaudiToday();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!taskIds.length || !reason) {
    redirect(`/worker/tasks?date=${returnDate}&message=${encoded("اختر مهمة واكتب سبب عدم التنفيذ")}`);
  }

  let evidencePaths: string[] = [];
  try {
    evidencePaths = await uploadTaskPhotos(supabase, `non-execution/${taskIds[0]}`, formData.getAll("evidence"));
  } catch (error) {
    redirect(`/worker/tasks?date=${returnDate}&message=${encoded(error instanceof Error ? error.message : "تعذر رفع الصور")}`);
  }

  const { error } = await supabase.rpc("submit_non_execution_group", {
    target_task_ids: taskIds,
    reason_value: reason,
    evidence_paths_value: evidencePaths,
  });

  if (error) {
    redirect(`/worker/tasks?date=${returnDate}&message=${encoded(error.message)}`);
  }

  revalidatePath("/worker/tasks");
  revalidatePath("/admin/planned-tasks");
  redirect(`/worker/tasks?date=${returnDate}&message=${encoded("تم تسجيل سبب عدم التنفيذ وإشعار المدير")}`);
}

export async function reschedulePlannedTaskGroupAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const taskIds = selectedValues(formData, "task_ids");
  const newDate = String(formData.get("new_date") ?? "").trim();
  const returnDate = optionalText(formData.get("return_date")) ?? getSaudiToday();
  const reason = optionalText(formData.get("reason")) ?? "admin_reschedule_after_non_execution";

  if (!taskIds.length || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded("اختر موعدا صحيحا لإعادة الجدولة")}`);
  }

  const [{ data: plannedStatus }, { data: assignedStatus }] = await Promise.all([
    supabase.from("task_statuses").select("id").eq("code", "PLANNED").maybeSingle(),
    supabase.from("assignment_statuses").select("id").eq("code", "ASSIGNED").maybeSingle(),
  ]);

  const { data: tasks, error: loadError } = await supabase
    .from("planned_tasks")
    .select("id,main_worker_id,original_values")
    .in("id", taskIds);

  if (loadError) {
    redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded(loadError.message)}`);
  }

  for (const task of tasks ?? []) {
    const originalValues = ((task.original_values as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    const { error } = await supabase
      .from("planned_tasks")
      .update({
        scheduled_date: newDate,
        original_due_date: newDate,
        status_id: plannedStatus?.id ?? null,
        assignment_status_id: task.main_worker_id ? assignedStatus?.id ?? null : null,
        original_values: {
          ...originalValues,
          rescheduled_after_non_execution: true,
          reschedule_reason: reason,
          rescheduled_to: newDate,
        },
      })
      .eq("id", task.id);

    if (error) {
      redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded(error.message)}`);
    }

    if (task.main_worker_id) {
      await supabase.from("notification_queue").insert({
        worker_id: task.main_worker_id,
        task_id: task.id,
        notification_type: "rescheduled_task",
        scheduled_for: `${newDate}T09:00:00+03:00`,
        payload: {
          message_ar: "تم تحديد موعد جديد لمهمة صيانة لم تنفذ",
          task_id: task.id,
          scheduled_date: newDate,
          reason,
        },
      });
    }
  }

  await supabase
    .from("admin_notifications")
    .update({ status: "resolved", read_at: new Date().toISOString() })
    .in("task_id", taskIds);

  await supabase
    .from("non_execution_reports")
    .update({ approval_status: "approved", updated_at: new Date().toISOString() })
    .in("task_id", taskIds);

  revalidatePath("/admin/planned-tasks");
  revalidatePath("/worker/tasks");
  redirect(`/admin/planned-tasks?date=${newDate}&message=${encoded("تم تحديد موعد جديد للمهمة")}`);
}

export async function markAdminNotificationReadAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const notificationId = String(formData.get("notification_id") ?? "");

  if (!notificationId) {
    redirect(`/admin/notifications?message=${encoded("تعذر تحديد الإشعار")}`);
  }

  const { error } = await supabase
    .from("admin_notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", notificationId);

  if (error) {
    redirect(`/admin/notifications?message=${encoded(error.message)}`);
  }

  revalidatePath("/admin/notifications");
  redirect(`/admin/notifications?message=${encoded("تم تعليم الإشعار كمقروء")}`);
}

export async function upsertOilAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const materialId = optionalText(formData.get("material_id"));
  const returnTo = optionalText(formData.get("return_to"));
  const payload = {
    material_kind: "oil",
    code: optionalText(formData.get("code")),
    name: String(formData.get("name") ?? "").trim(),
    brand: optionalText(formData.get("brand")),
    grade: optionalText(formData.get("grade")),
    unit: optionalText(formData.get("unit")) ?? "L",
    minimum_stock: optionalNumber(formData.get("minimum_stock")),
    reorder_level: optionalNumber(formData.get("reorder_level")),
    data_quality_status: "COMPLETE",
  };

  if (!payload.name) {
    redirect(`/admin/oils?message=${encoded("اسم الزيت مطلوب")}`);
  }

  const query = materialId
    ? supabase.from("materials").update(payload).eq("id", materialId)
    : supabase.from("materials").insert(payload);
  const { error } = await query;

  if (error) {
    redirect(`/admin/oils?message=${encoded(error.message)}`);
  }

  revalidatePath("/admin/oils");
  if (returnTo) {
    redirect(`${returnTo}?message=${encoded(materialId ? "تم تحديث الزيت" : "تم إضافة الزيت")}`);
  }
  redirect(`/admin/oils?message=${encoded(materialId ? "تم تحديث الزيت" : "تم إضافة الزيت")}`);
}

export async function upsertEquipmentAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const equipmentId = optionalText(formData.get("equipment_id"));
  const areaId = optionalText(formData.get("area_id"));
  const zone = optionalText(formData.get("zone"));
  const returnTo = optionalText(formData.get("return_to"));
  let productionLineId: string | null = null;

  if (areaId && zone) {
    const { data: line } = await supabase
      .from("production_lines")
      .upsert(
        {
          area_id: areaId,
          line_code: zone,
          name: zone,
          is_active: true,
        },
        { onConflict: "area_id,line_code" },
      )
      .select("id")
      .single();
    productionLineId = line?.id ?? null;
  }

  let currentOriginalValues: Record<string, unknown> = {};
  if (equipmentId) {
    const { data: currentEquipment } = await supabase
      .from("equipment")
      .select("original_values")
      .eq("id", equipmentId)
      .maybeSingle();
    currentOriginalValues = (currentEquipment?.original_values as Record<string, unknown> | null) ?? {};
  }

  const payload = {
    area_id: areaId,
    production_line_id: productionLineId,
    equipment_code: String(formData.get("equipment_code") ?? "").trim(),
    name: optionalText(formData.get("name")),
    description: optionalText(formData.get("description")),
    original_values: {
      ...currentOriginalValues,
      source_mode: currentOriginalValues.source_mode ?? "manual_equipment",
      master_line: zone ?? "بدون مكان",
      in_master: true,
      edited_manually: true,
    },
    data_quality_status: "COMPLETE",
    is_active: true,
  };

  if (!payload.equipment_code || !payload.name || !areaId) {
    redirect(`/admin/equipment?message=${encoded("كود المعدة والاسم والمنطقة مطلوبة")}`);
  }

  const query = equipmentId
    ? supabase.from("equipment").update(payload).eq("id", equipmentId)
    : supabase.from("equipment").insert(payload);
  const { error } = await query;

  if (error) {
    redirect(`/admin/equipment?message=${encoded(error.message)}`);
  }

  revalidatePath("/admin/equipment");
  if (returnTo) {
    redirect(`${returnTo}?message=${encoded(equipmentId ? "تم تحديث المعدة" : "تم إضافة المعدة")}`);
  }
  const redirectZone = zone ? `&zone=${encoded(zone)}` : "";
  redirect(`/admin/equipment?message=${encoded(equipmentId ? "تم تحديث المعدة" : "تم إضافة المعدة")}${redirectZone}`);
}

export async function createAdhocTaskAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const equipmentId = optionalText(formData.get("equipment_id"));
  const workerId = optionalText(formData.get("worker_id"));
  const scheduledDate = String(formData.get("scheduled_date") ?? "").trim();
  const issue = String(formData.get("issue") ?? "").trim();
  const priority = String(formData.get("priority") ?? "normal");

  if (!equipmentId || !workerId || !scheduledDate || !issue) {
    redirect(`/admin/ad-hoc-tasks?message=${encoded("المعدة والعامل واليوم ووصف المهمة مطلوبة")}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: report, error } = await supabase
    .from("troubleshooting_reports")
    .insert({
      equipment_id: equipmentId,
      issue,
      priority,
      scheduled_date: scheduledDate,
      status: "open",
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !report) {
    redirect(`/admin/ad-hoc-tasks?message=${encoded(error?.message ?? "تعذر إنشاء المهمة")}`);
  }

  await supabase.from("troubleshooting_assignees").insert({
    report_id: report.id,
    worker_id: workerId,
  });

  await supabase.from("notification_queue").insert({
    worker_id: workerId,
    notification_type: "adhoc_task",
    scheduled_for: `${scheduledDate}T09:00:00+03:00`,
    payload: {
      message_ar: "تم إسناد مهمة عارضة جديدة لك",
      report_id: report.id,
      issue,
      scheduled_date: scheduledDate,
    },
  });

  revalidatePath("/admin/ad-hoc-tasks");
  redirect(`/admin/ad-hoc-tasks?message=${encoded("تم إنشاء المهمة وإرسال إشعار للعامل")}`);
}

export async function updateAdhocExecutionAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const reportId = String(formData.get("report_id") ?? "");
  const startedAt = optionalText(formData.get("started_at"));
  const endedAt = optionalText(formData.get("ended_at"));
  const result = optionalText(formData.get("result"));
  const photos = formData.getAll("photos");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !reportId) {
    redirect(`/worker/tasks?message=${encoded("تعذر حفظ التقرير")}`);
  }

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!worker) {
    redirect(`/worker/tasks?message=${encoded("هذا الحساب غير مرتبط بعامل")}`);
  }

  const { data: existing } = await supabase
    .from("troubleshooting_reports")
    .select("photo_paths")
    .eq("id", reportId)
    .maybeSingle();

  const uploadedPaths: string[] = [];
  for (const photo of photos) {
    if (typeof photo === "string" || !photo || !("size" in photo) || photo.size === 0) continue;
    const file = photo as File;
    const path = `troubleshooting/${reportId}/${Date.now()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("maintenance-photos").upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (uploadError) {
      redirect(`/worker/tasks?message=${encoded(uploadError.message)}`);
    }
    uploadedPaths.push(path);
  }

  const currentPaths = Array.isArray(existing?.photo_paths) ? existing.photo_paths : [];
  const { error } = await supabase
    .from("troubleshooting_reports")
    .update({
      started_at: startedAt || null,
      ended_at: endedAt || null,
      result,
      status: endedAt ? "completed" : "in_progress",
      photo_paths: [...currentPaths, ...uploadedPaths],
    })
    .eq("id", reportId);

  if (error) {
    redirect(`/worker/tasks?message=${encoded(error.message)}`);
  }

  revalidatePath("/worker/tasks");
  redirect(`/worker/tasks?message=${encoded("تم حفظ تقرير المهمة العارضة")}`);
}
