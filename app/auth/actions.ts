"use server";

import { createClient } from "@/utils/supabase/server";
import { appUrl } from "@/utils/app-url";
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

function normalizeEquipmentCode(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
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

function taskExecutionDetail(formData: FormData, taskId: string) {
  const checklist = selectedValues(formData, `inspection_check_${taskId}`);
  const note = optionalText(formData.get(`task_note_${taskId}`));
  const parts: string[] = [];

  if (checklist.length) {
    parts.push(`نتيجة الفحص: ${checklist.join("، ")}`);
  }

  if (note) {
    parts.push(note);
  }

  return parts.join("\n");
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
  const origin = (await headers()).get("origin");
  const supabase = createClient(await cookies());

  if (!fullName || !email || password.length < 6) {
    redirect(`/auth/register?message=${encoded("اكتب الاسم والبريد وكلمة مرور لا تقل عن 6 أحرف")}`);
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: appUrl("/auth/callback", origin),
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
    if (error.message.toLowerCase().includes("email not confirmed")) {
      redirect(`/auth/verify-email?email=${encoded(email)}&message=${encoded("يجب تأكيد البريد الإلكتروني قبل استخدام النظام")}`);
    }

    redirect(`/auth/login?message=${encoded("بيانات الدخول غير صحيحة أو الحساب لم يتم تأكيده بعد")}`);
  }

  redirect("/");
}

export async function resendConfirmationAction(formData: FormData) {
  const formEmail = optionalText(formData.get("email"));
  const origin = (await headers()).get("origin");
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? formEmail;

  if (!email) {
    redirect(`/auth/verify-email?message=${encoded("اكتب البريد الإلكتروني لإعادة إرسال رابط التفعيل")}`);
  }

  if (user?.email_confirmed_at) {
    redirect(`/auth/login?message=${encoded("تم تأكيد البريد الإلكتروني بالفعل. يمكنك تسجيل الدخول الآن")}`);
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: appUrl("/auth/callback", origin),
    },
  });

  if (error) {
    redirect(`/auth/verify-email?email=${encoded(email)}&message=${encoded(error.message)}`);
  }

  redirect(`/auth/verify-email?email=${encoded(email)}&message=${encoded("تم إرسال رابط التفعيل مرة أخرى. افتح البريد الإلكتروني واضغط على رابط التأكيد")}`);
}

export async function resetPasswordAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const origin = (await headers()).get("origin");
  const supabase = createClient(await cookies());

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: appUrl("/auth/callback", origin),
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
  let workerId = optionalText(formData.get("worker_id"));
  const fullName = optionalText(formData.get("full_name")) ?? "عامل";
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

  if (approve && !workerId) {
    const { data: worker, error: workerError } = await supabase
      .from("workers")
      .insert({
        profile_id: profileId,
        full_name: fullName,
        is_active: true,
      })
      .select("id")
      .single();

    if (workerError || !worker) {
      redirect(`/admin/workers?message=${encoded(workerError?.message ?? "تعذر إنشاء سجل العامل")}`);
    }

    workerId = worker.id;
  }

  if (approve && workerId) {
    const areaResult = await saveWorkerAreas(supabase, workerId, areaIds);
    if (areaResult) {
      redirect(`/admin/workers?message=${encoded(areaResult)}`);
    }

    await supabase.from("notification_queue").insert({
      worker_id: workerId,
      notification_type: "account_approved",
      scheduled_for: new Date().toISOString(),
      payload: {
        message_ar: areaIds.length
          ? "تم اعتماد حسابك وتحديث مناطق العمل الخاصة بك. ستظهر المهام حسب المناطق المسندة إليك."
          : "تم اعتماد حسابك. لم يتم تحديد مناطق عمل بعد، وسيتم إظهار المهام عند إسناد منطقة لك.",
        area_count: areaIds.length,
      },
    });
  }

  revalidatePath("/worker/notifications");
  revalidatePath("/worker/tasks");
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

  await supabase.from("notification_queue").insert({
    worker_id: workerId,
    notification_type: "area_assignment_updated",
    scheduled_for: new Date().toISOString(),
    payload: {
      message_ar: "تم تحديث مناطق العمل الخاصة بك. ستظهر المهام حسب المناطق المسندة إليك.",
      area_count: areaIds.length,
    },
  });

  revalidatePath("/worker/notifications");
  revalidatePath("/worker/tasks");
  redirect(`/admin/workers?message=${encoded("تم حفظ مناطق العامل وتحديث مهام الخطة")}`);
}

async function saveWorkerAreas(supabase: ReturnType<typeof createClient>, workerId: string, areaIds: string[]) {
  if (!workerId) return "تعذر تحديد العامل";

  const { error } = await supabase.rpc("set_worker_area_assignments", {
    target_worker_id: workerId,
    target_area_ids: areaIds,
  });
  if (error) return error.message;

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
  const completedAt = toSaudiTimestamp(optionalText(formData.get("completed_at")));
  const notes = optionalText(formData.get("notes"));

  if (!taskIds.length) {
    redirect(`/worker/tasks?date=${returnDate}&message=${encoded("لا توجد مهام داخل الكارت")}`);
  }

  if (!startedAt || !completedAt) {
    redirect(`/worker/tasks?date=${returnDate}&message=${encoded("وقت البداية ووقت النهاية مطلوبان عند تسجيل تنفيذ المهمة")}`);
  }

  if (new Date(completedAt).getTime() < new Date(startedAt).getTime()) {
    redirect(`/worker/tasks?date=${returnDate}&message=${encoded("وقت النهاية يجب أن يكون بعد وقت البداية")}`);
  }

  const taskDetails = taskIds.reduce<Record<string, string>>((details, taskId) => {
    const value = taskExecutionDetail(formData, taskId);
    if (value) details[taskId] = value;
    return details;
  }, {});
  const materialUsage = taskIds.reduce<Record<string, number>>((usage, taskId) => {
    const value = optionalNumber(formData.get(`material_quantity_${taskId}`));
    if (value !== null) usage[taskId] = value;
    return usage;
  }, {});

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
    task_details_value: taskDetails,
    material_usage_value: materialUsage,
  });

  if (error) {
    redirect(`/worker/tasks?date=${returnDate}&message=${encoded(error.message)}`);
  }

  revalidatePath("/worker/tasks");
  revalidatePath("/worker/notifications");
  revalidatePath("/admin/planned-tasks");
  revalidatePath("/admin/notifications");
  redirect(`/worker/tasks?date=${returnDate}&message=${encoded("تم حفظ تنفيذ كارت المعدة وتحديث الخطة")}`);
}

export async function adminCompletePlannedTaskGroupAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const taskIds = selectedValues(formData, "task_ids");
  const returnDate = optionalText(formData.get("return_date")) ?? getSaudiToday();
  const completedAt = `${returnDate}T16:00:00+03:00`;

  if (!taskIds.length) {
    redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded("لا توجد مهام داخل الكارت")}`);
  }

  const { error } = await supabase.rpc("admin_complete_planned_task_group", {
    target_task_ids: taskIds,
    completed_at_value: completedAt,
    notes_value: "تم اعتبار كارت المعدة مكتمل بواسطة المدير",
  });

  if (error) {
    redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded(error.message)}`);
  }

  revalidatePath("/admin/planned-tasks");
  revalidatePath("/worker/tasks");
  revalidatePath("/admin/reports");
  redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded("تم اعتبار كارت المعدة مكتمل وتحديث الخطة")}`);
}

export async function adminUncompletePlannedTaskGroupAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const taskIds = selectedValues(formData, "task_ids");
  const returnDate = optionalText(formData.get("return_date")) ?? getSaudiToday();

  if (!taskIds.length) {
    redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded("لا توجد مهام داخل الكارت")}`);
  }

  const { error } = await supabase.rpc("admin_uncomplete_planned_task_group", {
    target_task_ids: taskIds,
  });

  if (error) {
    redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded(error.message)}`);
  }

  revalidatePath("/admin/planned-tasks");
  revalidatePath("/worker/tasks");
  revalidatePath("/admin/reports");
  redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded("تم إرجاع كارت المعدة إلى غير مكتمل")}`);
}

export async function submitNonExecutionGroupAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const taskIds = selectedValues(formData, "task_ids");
  const returnDate = optionalText(formData.get("return_date")) ?? getSaudiToday();
  const selectedReasons = selectedValues(formData, "non_execution_reason");
  const writtenReason = optionalText(formData.get("reason"));
  const reasonParts: string[] = [];

  if (selectedReasons.length) {
    reasonParts.push(`أسباب عدم التنفيذ: ${selectedReasons.join("، ")}`);
  }

  if (writtenReason) {
    reasonParts.push(`تفاصيل إضافية: ${writtenReason}`);
  }

  const reason = reasonParts.join("\n");

  if (!taskIds.length || !reason) {
    redirect(`/worker/tasks?date=${returnDate}&message=${encoded("اختر مهمة وحدد سبب عدم التنفيذ أو اكتب السبب")}`);
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
  revalidatePath("/admin/notifications");
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
    .select("id,main_worker_id,maintenance_point_id,original_values")
    .in("id", taskIds);

  if (loadError) {
    redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded("لم نتمكن من تحميل بيانات المهمة. يرجى المحاولة مرة أخرى.")}`);
  }

  if (!tasks?.length) {
    redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded("لم يتم العثور على المهمة المطلوبة.")}`);
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
      redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded("لم يتم حفظ الموعد الجديد. يرجى المحاولة مرة أخرى.")}`);
    }

    if (task.maintenance_point_id) {
      const { error: prepareError } = await supabase.rpc("prepare_maintenance_point_reschedule", {
        target_maintenance_point_id: task.maintenance_point_id,
        new_anchor_date: newDate,
        keep_task_id: task.id,
        reason: "admin_reschedule_after_review",
      });

      if (prepareError) {
        redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded("تم حفظ الموعد، لكن لم يكتمل تحديث الخطة. يرجى المحاولة مرة أخرى.")}`);
      }

      const { error: extendError } = await supabase.rpc("extend_dynamic_maintenance_plan", {
        target_start: newDate,
        months_ahead: 12,
        target_maintenance_point_id: task.maintenance_point_id,
      });

      if (extendError) {
        redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded("تم حفظ الموعد، لكن لم يكتمل تحديث الخطة. يرجى المحاولة مرة أخرى.")}`);
      }
    }

    if (task.main_worker_id) {
      const { error: workerNotificationError } = await supabase.from("notification_queue").insert({
        worker_id: task.main_worker_id,
        task_id: task.id,
        notification_type: "rescheduled_task",
        scheduled_for: `${newDate}T09:00:00+03:00`,
        payload: {
          message_ar: "تم تحديث موعد المهمة",
          task_id: task.id,
          scheduled_date: newDate,
          reason,
        },
      });

      if (workerNotificationError) {
        redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded("تم حفظ الموعد، لكن لم يتم إرسال إشعار العامل. يرجى المحاولة مرة أخرى.")}`);
      }
    }
  }

  const { error: notificationError } = await supabase
    .from("admin_notifications")
    .update({ status: "resolved", read_at: new Date().toISOString() })
    .in("task_id", taskIds);

  if (notificationError) {
    redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded("تم حفظ الموعد، لكن لم تكتمل إزالة المراجعة. يرجى المحاولة مرة أخرى.")}`);
  }

  const { error: reportApprovalError } = await supabase
    .from("non_execution_reports")
    .update({ approval_status: "approved", updated_at: new Date().toISOString() })
    .in("task_id", taskIds);

  if (reportApprovalError) {
    redirect(`/admin/planned-tasks?date=${returnDate}&message=${encoded("تم حفظ الموعد، لكن لم تكتمل إزالة المراجعة. يرجى المحاولة مرة أخرى.")}`);
  }

  revalidatePath("/admin/planned-tasks");
  revalidatePath("/admin/notifications");
  revalidatePath("/worker/tasks");
  revalidatePath("/worker/notifications");
  redirect(`/admin/planned-tasks?date=${newDate}&message=${encoded("تم حفظ الموعد الجديد وتحديث الخطة بنجاح")}`);
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

export async function markWorkerNotificationReadAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const notificationId = String(formData.get("notification_id") ?? "");

  if (!notificationId) {
    redirect(`/worker/notifications?message=${encoded("تعذر تحديد الإشعار")}`);
  }

  const { error } = await supabase.rpc("mark_worker_notification_read", {
    target_notification_id: notificationId,
  });

  if (error) {
    redirect(`/worker/notifications?message=${encoded(error.message)}`);
  }

  revalidatePath("/worker/notifications");
  revalidatePath("/worker/tasks");
  redirect(`/worker/notifications?message=${encoded("تم تعليم الإشعار كمطلع عليه")}`);
}

export async function upsertMaterialAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const materialId = optionalText(formData.get("material_id"));
  const returnTo = optionalText(formData.get("return_to"));
  const materialKind = String(formData.get("material_kind") ?? "oil").trim() === "grease" ? "grease" : "oil";
  let currentOriginalValues: Record<string, unknown> = {};
  if (materialId) {
    const { data: currentMaterial } = await supabase
      .from("materials")
      .select("original_values")
      .eq("id", materialId)
      .maybeSingle();
    currentOriginalValues = (currentMaterial?.original_values as Record<string, unknown> | null) ?? {};
  }
  const payload = {
    material_kind: materialKind,
    code: optionalText(formData.get("code")),
    name: String(formData.get("name") ?? "").trim(),
    brand: optionalText(formData.get("brand")),
    grade: optionalText(formData.get("grade")),
    unit: optionalText(formData.get("unit")) ?? (materialKind === "grease" ? "KG" : "L"),
    minimum_stock: optionalNumber(formData.get("minimum_stock")),
    reorder_level: optionalNumber(formData.get("reorder_level")),
    original_values: {
      ...currentOriginalValues,
      source_mode: currentOriginalValues.source_mode ?? "manual_inventory_material",
      manual_inventory_edited_at: new Date().toISOString(),
    },
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
  revalidatePath("/admin/materials");
  if (returnTo) {
    redirect(`${returnTo}?message=${encoded(materialId ? "تم تحديث الزيت" : "تم إضافة الزيت")}`);
  }
  redirect(`/admin/oils?message=${encoded(materialId ? "تم تحديث الزيت" : "تم إضافة الزيت")}`);
}

export async function upsertOilAction(formData: FormData) {
  formData.set("material_kind", "oil");
  await upsertMaterialAction(formData);
}

export async function createMaterialPurchaseAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const materialId = String(formData.get("material_id") ?? "");
  const returnTo = optionalText(formData.get("return_to")) ?? (materialId ? `/admin/materials/${materialId}` : "/admin/materials");
  const quantity = optionalNumber(formData.get("quantity"));
  const unit = optionalText(formData.get("unit"));
  const unitPrice = optionalNumber(formData.get("unit_price"));
  const notes = optionalText(formData.get("notes"));
  const transactionDate = toSaudiTimestamp(optionalText(formData.get("transaction_date"))) ?? new Date().toISOString();

  if (!materialId || quantity === null || quantity <= 0) {
    redirect(`${returnTo}?message=${encoded("الكمية المشتراة مطلوبة ويجب أن تكون أكبر من صفر")}`);
  }

  const { error } = await supabase.from("inventory_transactions").insert({
    material_id: materialId,
    transaction_type: "purchase",
    quantity,
    unit,
    unit_price: unitPrice,
    transaction_date: transactionDate,
    source_type: "manual_purchase",
    notes,
  });

  if (error) {
    redirect(`${returnTo}?message=${encoded(error.message)}`);
  }

  const { data: stockStatus } = await supabase
    .from("material_stock_alerts")
    .select("stock_status")
    .eq("material_id", materialId)
    .maybeSingle();

  if (stockStatus?.stock_status === "OK") {
    await supabase
      .from("admin_notifications")
      .update({ status: "resolved", read_at: new Date().toISOString() })
      .eq("notification_type", "material_low_stock")
      .eq("status", "pending")
      .eq("payload->>material_id", materialId);
  }

  revalidatePath("/");
  revalidatePath("/admin/materials");
  revalidatePath(`/admin/materials/${materialId}`);
  revalidatePath(`/admin/oils/${materialId}`);
  redirect(`${returnTo}?message=${encoded("تمت إضافة الكمية المشتراة وتحديث المخزون")}`);
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
  const equipmentCode = optionalText(formData.get("equipment_code"));
  const workerId = optionalText(formData.get("worker_id"));
  const scheduledDate = String(formData.get("scheduled_date") ?? "").trim();
  const issue = String(formData.get("issue") ?? "").trim();
  const priority = String(formData.get("priority") ?? "normal");

  if (!equipmentCode || !workerId || !scheduledDate || !issue) {
    redirect(`/admin/ad-hoc-tasks?message=${encoded("كود المعدة والعامل واليوم ووصف المهمة مطلوبة")}`);
  }

  const { data: equipmentRows, error: equipmentError } = await supabase
    .from("equipment")
    .select("id,equipment_code,name,areas(name)")
    .eq("is_active", true)
    .limit(2000);

  if (equipmentError) {
    redirect(`/admin/ad-hoc-tasks?message=${encoded(equipmentError.message)}`);
  }

  const normalizedCode = normalizeEquipmentCode(equipmentCode);
  const matchingEquipment = (equipmentRows ?? []).filter((item) => normalizeEquipmentCode(item.equipment_code ?? "") === normalizedCode);

  if (!matchingEquipment.length) {
    redirect(`/admin/ad-hoc-tasks?message=${encoded(`كود المعدة ${equipmentCode} غير موجود`)}`);
  }

  if (matchingEquipment.length > 1) {
    redirect(`/admin/ad-hoc-tasks?message=${encoded(`كود المعدة ${equipmentCode} موجود في أكثر من مكان، افتح صفحة المعدات وحدد المعدة المطلوبة`)}`);
  }

  const equipmentId = matchingEquipment[0].id;

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
  const returnTo = optionalText(formData.get("return_to")) ?? "/worker/ad-hoc-tasks";
  const startedAt = toSaudiTimestamp(optionalText(formData.get("started_at")));
  const endedAt = toSaudiTimestamp(optionalText(formData.get("ended_at")));
  const result = optionalText(formData.get("result"));
  const photos = formData.getAll("photos");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !reportId) {
    redirect(`${returnTo}?message=${encoded("تعذر حفظ التقرير")}`);
  }

  if (!startedAt || !endedAt) {
    redirect(`${returnTo}?message=${encoded("وقت البداية ووقت النهاية مطلوبان عند تسجيل تنفيذ المهمة")}`);
  }

  if (new Date(endedAt).getTime() < new Date(startedAt).getTime()) {
    redirect(`${returnTo}?message=${encoded("وقت النهاية يجب أن يكون بعد وقت البداية")}`);
  }

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!worker) {
    redirect(`${returnTo}?message=${encoded("هذا الحساب غير مرتبط بعامل")}`);
  }

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
      redirect(`${returnTo}?message=${encoded(uploadError.message)}`);
    }
    uploadedPaths.push(path);
  }

  const { error } = await supabase.rpc("update_adhoc_execution_report", {
    target_report_id: reportId,
    started_at_value: startedAt,
    ended_at_value: endedAt,
    result_value: result,
    photo_paths_value: uploadedPaths,
  });

  if (error) {
    redirect(`${returnTo}?message=${encoded(error.message)}`);
  }

  revalidatePath("/worker/ad-hoc-tasks");
  revalidatePath("/admin/notifications");
  redirect(`${returnTo}?message=${encoded("تم حفظ تقرير المهمة العارضة")}`);
}
