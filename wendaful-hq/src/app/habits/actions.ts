"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { startOfDay } from "@/lib/format";

export async function toggleHabitCheckin(habitId: string, done: boolean) {
  const today = startOfDay(new Date());

  if (done) {
    await db.habitCheckin.upsert({
      where: { habitId_date: { habitId, date: today } },
      create: { habitId, date: today, done: true },
      update: { done: true },
    });
  } else {
    await db.habitCheckin.deleteMany({
      where: { habitId, date: today },
    });
  }

  revalidatePath("/habits");
}
