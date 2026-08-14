import { startOfDay } from "./format";

export const MISSED_STREAK_FLAG_THRESHOLD = 3;
const WEEK_GRID_DAYS = 7;

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, amount: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

/**
 * Consecutive done-days up through today. Today isn't required for the
 * streak to be "alive" — it just doesn't add to the count until checked.
 */
export function computeCurrentStreak(doneDates: Set<string>, today: Date): number {
  let streak = 0;
  let cursor = startOfDay(today);

  if (doneDates.has(toDateKey(cursor))) {
    streak++;
  }
  cursor = addDays(cursor, -1);

  while (doneDates.has(toDateKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

/**
 * Consecutive missed days ending yesterday — today is still in progress,
 * so it's never counted as a miss.
 */
export function computeMissedStreak(
  doneDates: Set<string>,
  today: Date,
  since: Date,
): number {
  let missed = 0;
  let cursor = addDays(startOfDay(today), -1);
  const floor = startOfDay(since);

  while (cursor >= floor && !doneDates.has(toDateKey(cursor))) {
    missed++;
    cursor = addDays(cursor, -1);
  }

  return missed;
}

export type WeekGridDay = {
  date: Date;
  done: boolean;
  isToday: boolean;
};

/** Rolling 7 days ending today, oldest first. */
export function buildWeekGrid(doneDates: Set<string>, today: Date): WeekGridDay[] {
  const days: WeekGridDay[] = [];
  for (let i = WEEK_GRID_DAYS - 1; i >= 0; i--) {
    const date = addDays(startOfDay(today), -i);
    days.push({
      date,
      done: doneDates.has(toDateKey(date)),
      isToday: i === 0,
    });
  }
  return days;
}
