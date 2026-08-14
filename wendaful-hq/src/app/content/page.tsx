import { Clapperboard } from "lucide-react";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function ContentPipelinePage() {
  return (
    <ComingSoon
      title="Content Pipeline"
      blurb="Idea to posted, across TikTok, Instagram, and YouTube. Mirrors your ClickUp content calendar."
      icon={Clapperboard}
    />
  );
}
