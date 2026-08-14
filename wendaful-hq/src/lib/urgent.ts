import type {
  ClientTaskModel as ClientTask,
  ContentPostModel as ContentPost,
  CreativeProjectModel as CreativeProject,
} from "@/generated/prisma/models";
import { formatShortDate, startOfDay } from "./format";

export type UrgentFlag = {
  id: string;
  text: string;
};

const UPCOMING_DEADLINE_DAYS = 5;

export function getUrgentFlags({
  overdueClientTasks,
  duePosts,
  soonProjects,
}: {
  overdueClientTasks: ClientTask[];
  duePosts: ContentPost[];
  soonProjects: CreativeProject[];
}): UrgentFlag[] {
  const flags: UrgentFlag[] = [];
  const today = startOfDay();

  for (const task of overdueClientTasks) {
    if (!task.dueDate) continue;
    flags.push({
      id: `client-${task.id}`,
      text: `${task.client} task "${task.title}" was due ${formatShortDate(task.dueDate)}`,
    });
  }

  for (const post of duePosts) {
    if (!post.dueDate) continue;
    const isToday = startOfDay(post.dueDate).getTime() === today.getTime();
    flags.push({
      id: `post-${post.id}`,
      text: `"${post.title}" is due ${isToday ? "today" : formatShortDate(post.dueDate)} and still in ${post.stage}`,
    });
  }

  for (const project of soonProjects) {
    if (!project.deadline) continue;
    flags.push({
      id: `project-${project.id}`,
      text: `"${project.title}" is due ${formatShortDate(project.deadline)}`,
    });
  }

  return flags;
}

export { UPCOMING_DEADLINE_DAYS };
