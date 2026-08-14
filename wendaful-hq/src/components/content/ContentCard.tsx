"use client";

import { ArrowRight, Check } from "lucide-react";
import { formatShortDate } from "@/lib/format";
import { platformLabels } from "@/lib/labels";
import { platformIcons } from "@/lib/platformIcons";

export type ContentCardPost = {
  id: string;
  title: string;
  platform: string;
  stage: string;
  dueDate: Date | null;
  postedDate: Date | null;
};

export function ContentCard({
  post,
  onAdvance,
}: {
  post: ContentCardPost;
  onAdvance: (id: string) => void;
}) {
  const PlatformIcon = platformIcons[post.platform];
  const isPosted = post.stage === "posted";

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted">
        {PlatformIcon && <PlatformIcon size={12} />}
        <span>{platformLabels[post.platform] ?? post.platform}</span>
      </div>
      <p className="text-sm text-foreground">{post.title}</p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted">
          {isPosted && post.postedDate
            ? `Posted ${formatShortDate(post.postedDate)}`
            : post.dueDate
              ? `Due ${formatShortDate(post.dueDate)}`
              : "No date yet"}
        </span>
        {!isPosted && (
          <button
            onClick={() => onAdvance(post.id)}
            title="Move to next stage"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-accent-soft hover:text-accent"
          >
            <ArrowRight size={13} />
          </button>
        )}
        {isPosted && <Check size={13} className="text-accent" />}
      </div>
    </div>
  );
}
