import { Crown } from "lucide-react";

export function VipBadge({ size = "md", className = "" }: { size?: "sm" | "md"; className?: string }) {
  const dim = size === "sm" ? "h-5 px-1.5 text-[10px] gap-0.5" : "h-6 px-2 text-xs gap-1";
  const icon = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <span
      className={`inline-flex items-center rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 font-semibold text-white shadow-sm ${dim} ${className}`}
    >
      <Crown className={`${icon} fill-current`} /> VIP
    </span>
  );
}
