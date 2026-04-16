import { auth, signOut } from "@/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export async function TopBar() {
  const session = await auth();
  const login = (session?.user as { login?: string } | undefined)?.login ?? "operator";
  const image = session?.user?.image ?? undefined;

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div className="text-sm font-medium">Homelab Admin</div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            {image ? <AvatarImage src={image} alt={login} /> : null}
            <AvatarFallback>{login.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground">{login}</span>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
