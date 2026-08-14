"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Flame } from "lucide-react";
import { MISSED_STREAK_FLAG_THRESHOLD, type WeekGridDay } from "@/lib/habits";
import { toggleHabitCheckin } from "@/app/habits/actions";

export type HabitCardData = {
  id: string;
  name: string;
  icon: string | null;
  doneToday: boolean;
  streak: number;
  missedStreak: number;
  week: WeekGridDay[];
};

const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "narrow" });

export function HabitCard({ habit }: { habit: HabitCardData }) {
  const [doneToday, setDoneToday] = useState(habit.doneToday);
  const [, startTransition] = useTransition();
  const flagged = habit.missedStreak >= MISSED_STREAK_FLAG_THRESHOLD;

  function handleToggle() {
    const next = !doneToday;
    setDoneToday(next);
    startTransition(() => {
      toggleHabitCheckin(habit.id, next);
    });
  }

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        flagged ? "border-warn/40 bg-warn-soft" : "border-border bg-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{habit.icon}</span>
          <span className="text-sm font-medium text-foreground">{habit.name}</span>
          {flagged && (
            <span title={`Missed ${habit.missedStreak} days in a row`}>
              <AlertTriangle size={14} className="text-warn" />
            </span>
          )}
        </div>

        <motion.button
          onClick={handleToggle}
          whileTap={{ scale: 0.85 }}
          aria-pressed={doneToday}
          aria-label={`Mark ${habit.name} ${doneToday ? "not done" : "done"} today`}
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 ${
            doneToday
              ? "border-accent bg-accent"
              : "border-border bg-transparent hover:border-accent/60"
          }`}
        >
          <AnimatePresence>
            {doneToday && (
              <motion.span
                key="check"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 600, damping: 20 }}
              >
                <Check size={18} strokeWidth={3} className="text-accent-foreground" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm text-muted">
          <Flame
            size={14}
            className={habit.streak > 0 ? "text-accent" : "text-muted"}
          />
          <span>
            {habit.streak > 0
              ? `${habit.streak} day${habit.streak === 1 ? "" : "s"}`
              : "No streak yet"}
          </span>
        </div>

        <div className="flex gap-1.5">
          {habit.week.map((day) => (
            <div key={day.date.toISOString()} className="flex flex-col items-center gap-1">
              <span
                className={`block h-2.5 w-2.5 rounded-full ${
                  day.done
                    ? "bg-accent"
                    : day.isToday
                      ? "border border-accent/50"
                      : "border border-border"
                }`}
              />
              <span className="text-[10px] text-muted">
                {weekdayFormatter.format(day.date)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
