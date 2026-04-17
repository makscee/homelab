import { headers } from "next/headers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavAlertBadge } from "@/app/(auth)/_components/NavAlertBadge";

export async function TopBar() {
  const h = await headers();
  const login = h.get("x-user-login") ?? "operator";
  const image = h.get("x-user-picture") ?? undefined;

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div className="text-sm font-medium">Homelab Admin</div>
      <div className="flex items-center gap-3">
        <NavAlertBadge />
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            {image ? <AvatarImage src={image} alt={login} /> : null}
            <AvatarFallback>{login.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground">{login}</span>
        </div>
        <form action="/api/auth/signout" method="post">
          <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
