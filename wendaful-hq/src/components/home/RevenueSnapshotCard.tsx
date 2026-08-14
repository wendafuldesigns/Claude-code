import { DollarSign } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import { revenueSourceLabels } from "@/lib/labels";

type RevenueEntry = {
  id: string;
  source: string;
  amount: number;
  status: string;
};

export function RevenueSnapshotCard({ entries }: { entries: RevenueEntry[] }) {
  const received = entries
    .filter((e) => e.status === "received")
    .reduce((sum, e) => sum + e.amount, 0);
  const pending = entries
    .filter((e) => e.status === "pending")
    .reduce((sum, e) => sum + e.amount, 0);

  const bySource = new Map<string, number>();
  for (const entry of entries) {
    bySource.set(entry.source, (bySource.get(entry.source) ?? 0) + entry.amount);
  }

  return (
    <Card>
      <CardHeader title="Revenue this month" icon={<DollarSign size={16} />} />
      {entries.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing logged yet this month. It&apos;ll show up here once it does.
        </p>
      ) : (
        <>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-3xl font-semibold tracking-tight text-foreground">
              {formatCurrency(received)}
            </span>
            {pending > 0 && (
              <span className="text-sm text-muted">
                + {formatCurrency(pending)} pending
              </span>
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {Array.from(bySource.entries()).map(([source, amount]) => (
              <li
                key={source}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted">
                  {revenueSourceLabels[source] ?? source}
                </span>
                <span className="text-foreground">{formatCurrency(amount)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
