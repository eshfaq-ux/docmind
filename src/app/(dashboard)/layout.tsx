import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  // Load tenant storage info for topbar.
  // Retry once — Neon free-tier branches can time out on cold-start wake.
  let tenant: { storageBytes: number } | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, session.user.tenantId),
        columns: { storageBytes: true },
      });
      break;
    } catch (err) {
      if (attempt === 1) throw err; // surface on second failure
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  return (
    <SessionProvider session={session}>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <Topbar storageBytes={tenant?.storageBytes ?? 0} />
        <main className="ml-[220px] pt-14 min-h-screen">
          <div className="p-7">
            {children}
          </div>
        </main>
      </div>
    </SessionProvider>
  );
}
