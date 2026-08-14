import { AlertTriangle, PartyPopper } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import type { UrgentFlag } from "@/lib/urgent";

export function UrgentFlagsCard({ flags }: { flags: UrgentFlag[] }) {
  return (
    <Card>
      <CardHeader title="Anything urgent" icon={<AlertTriangle size={16} />} />
      {flags.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <PartyPopper size={16} className="text-accent" />
          <span>Nothing urgent today. Enjoy that.</span>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {flags.map((flag) => (
            <li
              key={flag.id}
              className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-foreground"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
              {flag.text}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
