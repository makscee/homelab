import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { issueCsrfCookieOnce } from "@/lib/csrf-cookie.server";

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
