"use client";

import { useState, useTransition } from "react";
import { Check, ListTodo } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { togglePriority } from "@/app/actions";

type Priority = {
  id: string;
  text: string;
  done: boolean;
};

export function PrioritiesCard({ priorities }: { priorities: Priority[] }) {
  const [items, setItems] = useState(priorities);
  const [, startTransition] = useTransition();

  function handleToggle(id: string, done: boolean) {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, done } : p)));
    startTransition(() => {
      togglePriority(id, done);
    });
  }

  return (
    <Card>
      <CardHeader title="Today's top 3" icon={<ListTodo size={16} />} />
      {items.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing on the list yet. Add your top 3 and get going.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => handleToggle(item.id, !item.done)}
                className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-hover"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    item.done
                      ? "border-accent bg-accent"
                      : "border-border group-hover:border-accent"
                  }`}
                >
                  {item.done && (
                    <Check size={12} strokeWidth={3} className="text-accent-foreground" />
                  )}
                </span>
                <span
                  className={`text-sm ${
                    item.done ? "text-muted line-through" : "text-foreground"
                  }`}
                >
                  {item.text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
