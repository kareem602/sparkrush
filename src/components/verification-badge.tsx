import { BadgeCheck, Star } from "lucide-react";

export type VerificationLevel = "unverified" | "pending" | "verified" | "premium";

export function VerificationBadge({
  status,
  isVip,
  size = "md",
  className = "",
}: {
  status: VerificationLevel;
  isVip?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  // Premium tier = verified + VIP. Promote display level if both true.
  const level: VerificationLevel =
    status === "verified" && isVip ? "premium" : status;

  if (level === "unverified" || level === "pending") return null;

  const dim = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  if (level === "premium") {
    return (
      <span
        title="Premium verified"
        className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-pink-500 text-white shadow-sm ${dim} ${className}`}
      >
        <Star className="h-2.5 w-2.5 fill-current" strokeWidth={3} />
      </span>
    );
  }

  return (
    <BadgeCheck
      title="Verified"
      className={`text-sky-500 fill-sky-500/15 ${dim} ${className}`}
      strokeWidth={2.5}
    />
  );
}
