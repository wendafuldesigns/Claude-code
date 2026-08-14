"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

export async function togglePriority(id: string, done: boolean) {
  await db.priority.update({
    where: { id },
    data: { done },
  });
  revalidatePath("/");
}
