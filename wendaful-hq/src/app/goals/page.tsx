import { Target } from "lucide-react";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function GoalsPage() {
  return (
    <ComingSoon
      title="Goals"
      blurb="Monthly, quarterly, and yearly, so the big stuff doesn't get lost in the daily stuff."
      icon={Target}
    />
  );
}
