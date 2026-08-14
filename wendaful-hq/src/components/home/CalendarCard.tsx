import { CalendarDays } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";

type Event = {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
};

export function CalendarCard({ events }: { events: Event[] }) {
  return (
    <Card>
      <CardHeader title="On your calendar today" icon={<CalendarDays size={16} />} />
      {events.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing on the calendar today. Enjoy the open space.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((event) => (
            <li key={event.id} className="flex items-baseline gap-4 text-sm">
              <span className="w-36 shrink-0 whitespace-nowrap text-muted">
                {event.startTime ?? "All day"}
                {event.endTime ? ` – ${event.endTime}` : ""}
              </span>
              <span className="text-foreground">{event.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
