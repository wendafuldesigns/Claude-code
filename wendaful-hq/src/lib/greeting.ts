const NAME = "Wenda";

export function getGreeting(hour: number = new Date().getHours()) {
  if (hour < 5) return `Still up, ${NAME}? Here's the quick rundown.`;
  if (hour < 12) return `Morning, ${NAME}. Let's see what today's got.`;
  if (hour < 17) return `Afternoon, ${NAME}. Here's where things stand.`;
  if (hour < 21) return `Evening, ${NAME}. Almost through the day.`;
  return `Still up, ${NAME}? Here's the quick rundown.`;
}
