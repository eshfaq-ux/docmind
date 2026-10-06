import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DocMind",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
