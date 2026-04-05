import { cn } from "@/lib/utils";
import { proxyImageUrl } from "@/lib/supabase";
import type { User } from "@/types";

interface AvatarProps {
  user: User;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "w-7 h-7 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
};

export function Avatar({ user, size = "md", className }: AvatarProps) {
  return (
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
