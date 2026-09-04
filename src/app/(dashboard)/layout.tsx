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

  // Load tenant storage info for topbar
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, session.user.tenantId),
    columns: { storageBytes: true },
  });

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
