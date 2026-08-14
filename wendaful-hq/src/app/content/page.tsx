import { db } from "@/lib/db";
import { ContentPipelineView } from "@/components/content/ContentPipelineView";

export const dynamic = "force-dynamic";

export default async function ContentPipelinePage() {
  const posts = await db.contentPost.findMany({
    orderBy: { createdAt: "asc" },
  });

  return <ContentPipelineView posts={posts} />;
}
