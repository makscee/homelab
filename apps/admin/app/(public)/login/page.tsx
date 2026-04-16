import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/" });
        }}
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Homelab Admin</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with GitHub to continue.
        </p>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Continue with GitHub
        </button>
      </form>
    </main>
  );
}
