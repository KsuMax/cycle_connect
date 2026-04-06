import { cn } from "@/lib/utils";
import { proxyImageUrl } from "@/lib/supabase";
import type { User } from "@/types";
import type { UserSticker } from "@/lib/stickers";

interface AvatarProps {
  user: User;
  size?: "sm" | "md" | "lg";
  className?: string;
  sticker?: UserSticker | null;
}

const SIZE_CLASSES = {
  sm: "w-7 h-7 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
};

// Sticker badge size scales with avatar size
const STICKER_SIZES = {
  sm: "w-4 h-4 text-[8px] -bottom-0.5 -right-0.5 border",
  md: "w-5 h-5 text-[9px] -bottom-1 -right-1 border-2",
  lg: "w-6 h-6 text-[11px] -bottom-1 -right-1 border-2",
};

export function Avatar({ user, size = "md", className, sticker }: AvatarProps) {
  const inner = (
    <div
      className={cn(
        "rounded-full overflow-hidden flex items-center justify-center font-semibold text-white shrink-0",
        SIZE_CLASSES[size],
        className
      )}
      style={{ backgroundColor: user.color }}
      title={user.name}
    >
      {user.avatar_url
        ? <img src={proxyImageUrl(user.avatar_url) ?? user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
        : user.initials
      }
    </div>
  );

  if (!sticker) return inner;

  return (
    <div className="relative inline-block shrink-0">
      {inner}
      <div
        className={cn(
          "absolute rounded-full flex items-center justify-center leading-none border-white cursor-help select-none",
          STICKER_SIZES[size]
        )}
        style={{ background: sticker.bg }}
        title={sticker.tooltip}
      >
        {sticker.emoji}
      </div>
    </div>
  );
}

interface AvatarGroupProps {
  users: User[];
  max?: number;
  size?: "sm" | "md";
  label?: string;
}

export function AvatarGroup({ users, max = 4, size = "sm", label }: AvatarGroupProps) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-1.5">
        {shown.map((user) => (
          <Avatar key={user.id} user={user} size={size} className="ring-2 ring-white" />
        ))}
        {rest > 0 && (
          <div
            className={cn(
              "rounded-full flex items-center justify-center text-xs font-semibold ring-2 ring-white",
              size === "sm" ? "w-7 h-7" : "w-9 h-9"
            )}
            style={{ backgroundColor: "#E4E4E7", color: "#71717A" }}
          >
            +{rest}
          </div>
        )}
      </div>
      {label && <span className="text-xs text-[#71717A]">{label}</span>}
    </div>
  );
}
