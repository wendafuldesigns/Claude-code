import { Sparkles } from "lucide-react";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function CreativeProjectsPage() {
  return (
    <ComingSoon
      title="Creative Projects"
      blurb="Content series, product launches, and everything else with a deadline attached."
      icon={Sparkles}
    />
  );
}
