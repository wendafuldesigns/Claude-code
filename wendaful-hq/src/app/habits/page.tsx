import { HeartPulse } from "lucide-react";
import { db } from "@/lib/db";
import {
  buildWeekGrid,
  computeCurrentStreak,
  computeMissedStreak,
  toDateKey,
} from "@/lib/habits";
import { HabitsSummary } from "@/components/habits/HabitsSummary";
import { HabitCard } from "@/components/habits/HabitCard";

export const dynamic = "force-dynamic";

export default async function HabitsPage() {
  const habits = await db.habit.findMany({
    orderBy: { order: "asc" },
    include: { checkins: true },
  });

  const today = new Date();

  const habitData = habits.map((habit) => {
    const doneDates = new Set(
      habit.checkins.filter((c) => c.done).map((c) => toDateKey(c.date)),
    );
    return {
      id: habit.id,
      name: habit.name,
      icon: habit.icon,
      doneToday: doneDates.has(toDateKey(today)),
      streak: computeCurrentStreak(doneDates, today),
      missedStreak: computeMissedStreak(doneDates, today, habit.createdAt),
      week: buildWeekGrid(doneDates, today),
    };
  });

  const doneCount = habitData.filter((h) => h.doneToday).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Habits
          </h1>
          <p className="mt-1 text-sm text-muted">
            Check in daily. Streaks reset at midnight, not the moment you wake up.
          </p>
        </div>
        <div
          title="Apple Health — not connected yet"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted transition-colors hover:text-accent"
        >
          <HeartPulse size={15} strokeWidth={2} />
        </div>
      </div>

      <HabitsSummary done={doneCount} total={habitData.length} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {habitData.map((habit) => (
          <HabitCard key={habit.id} habit={habit} />
        ))}
      </div>
    </div>
  );
}
