"use server";

import { createClient } from "@/utils/supabase/server";
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
  const approve = String(formData.get("approve") ?? "true") === "true";
  const supabase = createClient(await cookies());

  const { error } = await supabase.rpc("approve_worker", {
    worker_profile_id: profileId,
    approve,
  });

  if (error) {
    redirect(`/admin/workers?message=${encoded(error.message)}`);
  }

  redirect(`/admin/workers?message=${encoded(approve ? "تم اعتماد العامل" : "تم رفض العامل")}`);
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

  revalidatePath("/admin/planned-tasks");
  redirect(`/admin/planned-tasks?page=${taskPage}&message=${encoded("تم تحديث المهمة")}`);
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

  const [{ data: status }, { data: unassigned }, { data: assigned }] = await Promise.all([
    supabase.from("task_statuses").select("id").eq("code", "NEEDS_ASSIGNMENT").maybeSingle(),
    supabase.from("assignment_statuses").select("id").eq("code", "UNASSIGNED").maybeSingle(),
    supabase.from("assignment_statuses").select("id").eq("code", "ASSIGNED").maybeSingle(),
  ]);

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
