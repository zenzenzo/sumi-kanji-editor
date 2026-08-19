import { Link } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="h-9 w-24 animate-pulse rounded-[var(--radius-xs)] bg-paper/15" />;
  }
  if (!user) {
    return (
      <Button asChild variant="ghost" size="sm" className="text-paper hover:bg-paper/10">
        <Link to="/login">Sign in</Link>
      </Button>
    );
  }
  const label = user.displayName ?? user.primaryEmail ?? "Account";
  return (
    <div className="flex items-center gap-2">
      {user.profileImageUrl ? (
        <img
          src={user.profileImageUrl}
          alt=""
          className="size-8 rounded-full object-cover ring-1 ring-paper/20"
        />
      ) : (
        <span className="grid size-8 place-items-center rounded-full bg-paper/15 font-display text-sm text-paper">
          {label.charAt(0)}
        </span>
      )}
      <span className="hidden max-w-[8rem] truncate text-sm text-paper/80 sm:inline">{label}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-paper/70 hover:bg-paper/10 hover:text-paper"
        onClick={() => void signOut()}
      >
        Sign out
      </Button>
    </div>
  );
}
