import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "DocMind — AI Knowledge Base for Your Documents",
  description:
    "Upload PDFs, Word docs, and text files. Ask questions. Get streaming answers with inline citations, confidence scoring, and a full evaluation harness.",
  openGraph: {
    title: "DocMind — AI Knowledge Base for Your Documents",
    description: "Upload documents, ask questions, get precise answers with citations.",
    type: "website",
  },
};

export default function Home() {
  return <LandingPage />;
}
