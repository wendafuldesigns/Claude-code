"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { navItems, toolItems } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface/60 px-4 py-6">
      <div className="mb-8 flex items-center gap-2 px-2">
        <span className="h-2 w-2 rounded-full bg-accent" />
        <span className="text-sm font-semibold tracking-wide text-foreground">
          Wendaful HQ
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
            >
              {isActive && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-accent-soft"
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}
              <Icon
                size={17}
                strokeWidth={2}
                className={`relative z-10 ${
                  isActive ? "text-accent" : "text-muted"
                }`}
              />
              <span
                className={`relative z-10 ${
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 border-t border-border pt-4">
        <p className="mb-3 px-2 text-[11px] font-medium uppercase tracking-wider text-muted">
          Everyday tools
        </p>
        <div className="flex flex-wrap gap-1.5 px-2">
          {toolItems.map((tool) => {
            const Icon = tool.icon;
            return (
              <div
                key={tool.name}
                title={`${tool.name} — not connected yet`}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-muted transition-colors hover:text-accent"
              >
                <Icon size={14} strokeWidth={2} />
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
