import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { issueCsrfCookieOnce } from "@/lib/csrf-cookie.server";
// Nav items rendered by <Sidebar /> — see components/layout/nav-items.ts:
//   { href: "/",      label: "Overview" }
//   { href: "/audit", label: "Audit" }
// The firing-alert badge <NavAlertBadge /> is mounted by <TopBar /> on the
// right side of the top bar (components/layout/topbar.tsx). Hidden on zero.

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await issueCsrfCookieOnce();
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopBar />
        <main className="flex-1 p-6">{children}</main>
      </div>
      <Toaster position="top-right" />
    </div>
  );
}
