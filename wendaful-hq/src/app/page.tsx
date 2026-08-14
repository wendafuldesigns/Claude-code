import { db } from "@/lib/db";
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  startOfNextMonth,
  formatLongDate,
} from "@/lib/format";
import { getGreeting } from "@/lib/greeting";
import { getUrgentFlags, UPCOMING_DEADLINE_DAYS } from "@/lib/urgent";
import { PrioritiesCard } from "@/components/home/PrioritiesCard";
import { CalendarCard } from "@/components/home/CalendarCard";
import { RevenueSnapshotCard } from "@/components/home/RevenueSnapshotCard";
import { UrgentFlagsCard } from "@/components/home/UrgentFlagsCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const monthStart = startOfMonth(now);
  const monthEnd = startOfNextMonth(now);
  const soonCutoff = new Date(todayStart);
  soonCutoff.setDate(soonCutoff.getDate() + UPCOMING_DEADLINE_DAYS);

  const [priorities, events, revenueEntries, overdueClientTasks, duePosts, soonProjects] =
    await Promise.all([
      db.priority.findMany({
        where: { date: { gte: todayStart, lt: todayEnd } },
        orderBy: { order: "asc" },
      }),
      db.calendarEvent.findMany({
        where: { date: { gte: todayStart, lt: todayEnd } },
        orderBy: { date: "asc" },
      }),
      db.revenueEntry.findMany({
        where: { date: { gte: monthStart, lt: monthEnd } },
      }),
      db.clientTask.findMany({
        where: { status: { not: "done" }, dueDate: { lt: todayStart } },
      }),
      db.contentPost.findMany({
        where: { stage: { not: "posted" }, dueDate: { lt: todayEnd } },
      }),
      db.creativeProject.findMany({
        where: {
          status: { not: "done" },
          deadline: { gte: todayStart, lt: soonCutoff },
        },
      }),
    ]);

  const urgentFlags = getUrgentFlags({ overdueClientTasks, duePosts, soonProjects });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm text-muted">{formatLongDate(now)}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {getGreeting(now.getHours())}
        </h1>
      </div>

      <PrioritiesCard priorities={priorities} />

      <CalendarCard events={events} />

      <RevenueSnapshotCard entries={revenueEntries} />

      <UrgentFlagsCard flags={urgentFlags} />
    </div>
  );
}
