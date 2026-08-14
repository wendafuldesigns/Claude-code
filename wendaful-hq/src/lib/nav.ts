import {
  Home,
  Clapperboard,
  Flame,
  DollarSign,
  Briefcase,
  Target,
  Sparkles,
  ListChecks,
  CalendarDays,
  Mail,
  Camera,
  Music2,
  PlaySquare,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/content", label: "Content Pipeline", icon: Clapperboard },
  { href: "/habits", label: "Habits", icon: Flame },
  { href: "/revenue", label: "Revenue", icon: DollarSign },
  { href: "/clients", label: "Client Work", icon: Briefcase },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/projects", label: "Creative Projects", icon: Sparkles },
];

export type ToolItem = {
  name: string;
  icon: LucideIcon;
};

export const toolItems: ToolItem[] = [
  { name: "ClickUp", icon: ListChecks },
  { name: "Apple Calendar", icon: CalendarDays },
  { name: "Gmail", icon: Mail },
  { name: "Instagram", icon: Camera },
  { name: "TikTok", icon: Music2 },
  { name: "YouTube", icon: PlaySquare },
];
