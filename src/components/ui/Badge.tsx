import { cn } from "@/lib/utils";
import type { Difficulty } from "@/types";

interface BadgeProps {
  children?: React.ReactNode;
  variant?: "default" | "difficulty" | "surface" | "outline";
  difficulty?: Difficulty;
  className?: string;
}

const DIFFICULTY_CONFIG: Record<Difficulty, { label: string; bg: string; text: string; emoji: string }> = {
  easy: { label: "Лёгкий", bg: "#DCFCE7", text: "#15803D", emoji: "⭐" },
  medium: { label: "Средний", bg: "#FEF3C7", text: "#B45309", emoji: "🔥" },
  hard: { label: "Сложный", bg: "#FEE2E2", text: "#DC2626", emoji: "💀" },
};

export function Badge({ children, variant = "default", difficulty, className }: BadgeProps) {
  if (variant === "difficulty" && difficulty) {
    const cfg = DIFFICULTY_CONFIG[difficulty];
    return (
      <span
        className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold", className)}
        style={{ backgroundColor: cfg.bg, color: cfg.text }}
      >
        <span>{cfg.emoji}</span>
        <span>{cfg.label}</span>
      </span>
    );
  }

  if (variant === "surface") {
    return (
      <span
        className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium", className)}
        style={{ backgroundColor: "#E6FAF9", color: "#0D9488" }}
      >
        {children}
      </span>
    );
  }

  if (variant === "outline") {
    return (
      <span
        className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border", className)}
        style={{ borderColor: "#E4E4E7", color: "#71717A" }}
      >
        {children}
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium", className)}
      style={{ backgroundColor: "#F0ECFF", color: "#6D28D9" }}
    >
      {children}
    </span>
  );
}

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return <Badge variant="difficulty" difficulty={difficulty} />;
}
