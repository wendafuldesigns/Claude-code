export const revenueSourceLabels: Record<string, string> = {
  clickup_affiliate: "ClickUp affiliate",
  youtube_ads: "YouTube ads",
  sponsorship: "Sponsorships",
  planning_lab: "Planning Lab",
};

export const platformLabels: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
};

export const contentStageLabels: Record<string, string> = {
  idea: "Idea",
  scripting: "Scripting",
  filming: "Filming",
  editing: "Editing",
  scheduled: "Scheduled",
  posted: "Posted",
};

export const contentStageOrder = [
  "idea",
  "scripting",
  "filming",
  "editing",
  "scheduled",
  "posted",
] as const;

export function nextContentStage(stage: string): string | null {
  const index = contentStageOrder.indexOf(stage as (typeof contentStageOrder)[number]);
  if (index === -1 || index === contentStageOrder.length - 1) return null;
  return contentStageOrder[index + 1];
}

