import { Flame } from "lucide-react";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function HabitsPage() {
  return (
    <ComingSoon
      title="Habits"
      blurb="Daily check-ins and streaks, so you can see what's actually sticking."
      icon={Flame}
    />
  );
}
