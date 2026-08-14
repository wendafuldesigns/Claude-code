import { type LucideIcon } from "lucide-react";

export function ComingSoon({
  title,
  blurb,
  icon: Icon,
}: {
  title: string;
  blurb: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-surface/40 px-6 py-16">
      <Icon size={22} className="text-accent" strokeWidth={1.75} />
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="max-w-md text-sm leading-relaxed text-muted">{blurb}</p>
      <p className="text-sm text-muted">
        Not built yet. Something is always better than nothing, so this
        one&apos;s next up.
      </p>
    </div>
  );
}
