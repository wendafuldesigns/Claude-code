"use client";

import { useMemo, useState, useTransition } from "react";
import {
  contentStageLabels,
  contentStageOrder,
  nextContentStage,
  platformLabels,
} from "@/lib/labels";
import { ContentCard, type ContentCardPost } from "./ContentCard";
import { advanceContentStage } from "@/app/content/actions";

const FILTERS = ["all", "tiktok", "instagram", "youtube"] as const;
type Filter = (typeof FILTERS)[number];

export function ContentPipelineView({ posts: initialPosts }: { posts: ContentCardPost[] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [filter, setFilter] = useState<Filter>("all");
  const [, startTransition] = useTransition();

  const filtered = useMemo(
    () => (filter === "all" ? posts : posts.filter((p) => p.platform === filter)),
    [posts, filter],
  );

  const columns = useMemo(() => {
    return contentStageOrder.map((stage) => ({
      stage,
      posts: filtered.filter((p) => p.stage === stage),
    }));
  }, [filtered]);

  function handleAdvance(id: string) {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const stage = nextContentStage(p.stage) ?? p.stage;
        return {
          ...p,
          stage,
          postedDate: stage === "posted" ? new Date() : p.postedDate,
        };
      }),
    );
    startTransition(() => {
      advanceContentStage(id);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Content Pipeline
        </h1>
        <p className="mt-1 text-sm text-muted">
          Idea to posted, across TikTok, Instagram, and YouTube.
        </p>
      </div>

      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              filter === f
                ? "bg-accent-soft text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            {f === "all" ? "All" : platformLabels[f]}
          </button>
        ))}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div key={col.stage} className="flex w-56 shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
                {contentStageLabels[col.stage]}
              </h2>
              <span className="text-xs text-muted">{col.posts.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {col.posts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted">
                  Nothing here
                </div>
              ) : (
                col.posts.map((post) => (
                  <ContentCard key={post.id} post={post} onAdvance={handleAdvance} />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
