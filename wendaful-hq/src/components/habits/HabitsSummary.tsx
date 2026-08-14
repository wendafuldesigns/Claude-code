import { PartyPopper } from "lucide-react";
import { Card } from "@/components/ui/Card";

export function HabitsSummary({ done, total }: { done: number; total: number }) {
  const allDone = total > 0 && done === total;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Today</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            {done} of {total} done
          </p>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full ${
                i < done ? "bg-accent" : "bg-border"
              }`}
            />
          ))}
        </div>
      </div>
      {allDone && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
          <PartyPopper size={15} />
          <span>That&apos;s all {total}. Nice work today.</span>
        </div>
      )}
    </Card>
  );
}
