"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { nextContentStage } from "@/lib/labels";

export async function advanceContentStage(id: string) {
  const post = await db.contentPost.findUniqueOrThrow({ where: { id } });
  const next = nextContentStage(post.stage);
  if (!next) return;

  await db.contentPost.update({
    where: { id },
    data: {
      stage: next,
      postedDate: next === "posted" ? new Date() : post.postedDate,
    },
  });
  revalidatePath("/content");
}
