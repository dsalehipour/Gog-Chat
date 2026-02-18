import type { Routine } from "./types";

export function getNextRunTime(routine: Routine): number {
  const { schedule } = routine;
  const now = new Date();
  const [hours, minutes] = schedule.time.split(":").map(Number);

  if (schedule.type === "once" && schedule.onceDate) {
    const d = new Date(`${schedule.onceDate}T${schedule.time}:00`);
    return d.getTime();
  }

  if (schedule.type === "daily") {
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime();
  }

  if (schedule.type === "weekly" && schedule.dayOfWeek !== undefined) {
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    const currentDay = next.getDay();
    let daysAhead = schedule.dayOfWeek - currentDay;
    if (daysAhead < 0 || (daysAhead === 0 && next.getTime() <= now.getTime())) {
      daysAhead += 7;
    }
    next.setDate(next.getDate() + daysAhead);
    return next.getTime();
  }

  if (schedule.type === "monthly" && schedule.dayOfMonth !== undefined) {
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    next.setDate(schedule.dayOfMonth);
    if (next.getTime() <= now.getTime()) {
      next.setMonth(next.getMonth() + 1);
    }
    return next.getTime();
  }

  return now.getTime() + 86400000;
}

export function isDue(routine: Routine): boolean {
  if (!routine.enabled) return false;
  return Date.now() >= routine.nextRun;
}
