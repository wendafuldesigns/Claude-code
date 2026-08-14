import { DollarSign } from "lucide-react";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function RevenuePage() {
  return (
    <ComingSoon
      title="Revenue"
      blurb="Totals and recent activity across ClickUp affiliate, YouTube ads, sponsorships, and Planning Lab."
      icon={DollarSign}
    />
  );
}
