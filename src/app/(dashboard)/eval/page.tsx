"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FlaskConical,
  Plus,
  Play,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvalResult {
  id: string;
  caseId: string;
  generatedAnswer: string;
  faithfulness: number | null;
  answerRelevance: number | null;
  retrievalRelevance: number | null;
  citationAccuracy: number | null;
  passed: boolean;
  case?: { question: string; expectedAnswer: string | null };
}

interface EvalRun {
  id: string;
  label: string;
  avgFaithfulness: number | null;
  avgAnswerRelevance: number | null;
  avgRetrievalRelevance: number | null;
  avgCitationAccuracy: number | null;
  passedCount: number | null;
  totalCount: number | null;
  createdAt: string;
  results?: EvalResult[];
}

interface Dataset {
  id: string;
  name: string;
  kbId: string;
  caseCount: number;
  createdAt: string;
  runs: EvalRun[];
}

interface KB {
  id: string;
  name: string;
}

// ── Shared score sub-components ───────────────────────────────────────────────

/** Animated progress-bar score badge (used in dataset summary). */
function ScoreBadge({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  const pct = Math.round(value * 100);
  const barColor =
    pct >= 70 ? "bg-emerald-400" :
    pct >= 50 ? "bg-amber-400"   :
                "bg-rose-400";
  const textColor =
    pct >= 70 ? "text-emerald-400" :
    pct >= 50 ? "text-amber-400"   :
                "text-rose-400";
  return (
    <div
      className="flex-1 min-w-[80px]"
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label}: ${pct}%`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground/60 font-medium">{label}</span>
        <span className={cn("text-[12px] font-bold tabular-nums", textColor)}>{pct}%</span>
      </div>
      <div className="h-[3px] w-full rounded-full bg-white/[0.08] overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Compact inline score (used in comparison table and per-question rows). */
function ScoreCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground/40">—</span>;
  const pct = Math.round(value * 100);
  const color =
    pct >= 70 ? "text-emerald-400" :
    pct >= 50 ? "text-amber-400"   :
                "text-rose-400";
  return <span className={color}>{pct}%</span>;
}

// ── Per-question result row ───────────────────────────────────────────────────

function ResultRow({ result, index }: { result: EvalResult; index: number }) {
  const [open, setOpen] = useState(false);
  const question = result.case?.question ?? `Question ${index + 1}`;

  return (
    <div className={cn(
      "rounded-lg border transition-colors",
      result.passed
        ? "border-emerald-500/15 bg-emerald-500/[0.03]"
        : "border-rose-500/15 bg-rose-500/[0.03]"
    )}>
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {result.passed
          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
          : <XCircle      className="w-3.5 h-3.5 text-rose-400    shrink-0" aria-hidden="true" />
        }
        <span className="flex-1 text-[12px] text-foreground/80 truncate">{question}</span>
        <div className="flex gap-2 shrink-0 text-[11px]">
          <ScoreCell value={result.faithfulness} />
          <ScoreCell value={result.answerRelevance} />
        </div>
        {open
          ? <ChevronUp   className="w-3 h-3 text-muted-foreground/40 shrink-0" />
          : <ChevronDown className="w-3 h-3 text-muted-foreground/40 shrink-0" />
        }
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-white/[0.05] pt-2.5">
          {/* All metrics */}
          <div className="flex flex-wrap gap-4 text-[11px]">
            <span className="text-muted-foreground/60">Faithfulness <ScoreCell value={result.faithfulness} /></span>
            <span className="text-muted-foreground/60">Answer Rel. <ScoreCell value={result.answerRelevance} /></span>
            <span className="text-muted-foreground/60">Retrieval <ScoreCell value={result.retrievalRelevance} /></span>
            {result.citationAccuracy !== null && (
              <span className="text-muted-foreground/60">Citations <ScoreCell value={result.citationAccuracy} /></span>
            )}
          </div>
          {/* Generated answer */}
          <div>
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1">Generated answer</p>
            <p className="text-[12px] text-foreground/80 leading-relaxed line-clamp-5">{result.generatedAnswer}</p>
          </div>
          {/* Expected answer */}
          {result.case?.expectedAnswer && (
            <div>
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1">Expected answer</p>
              <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-3">{result.case.expectedAnswer}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Dataset card ──────────────────────────────────────────────────────────────

function DatasetCard({
  dataset,
  onRunStarted,
}: {
  dataset: Dataset;
  onRunStarted: (id: string) => void;
}) {
  const [running, setRunning] = useState(false);
  const [drilldownRunId, setDrilldownRunId] = useState<string | null>(null);
  const [drilldownResults, setDrilldownResults] = useState<EvalResult[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const latestRun = dataset.runs[0];

  async function runEval() {
    setRunning(true);
    try {
      const res = await fetch(`/api/eval/${dataset.id}/run`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Eval run failed");
      }
      toast.success("Eval run complete");
      onRunStarted(dataset.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function toggleDrilldown(runId: string) {
    if (drilldownRunId === runId) {
      setDrilldownRunId(null);
      return;
    }
    setDrilldownRunId(runId);
    setDrilldownLoading(true);
    try {
      const res = await fetch(`/api/eval/${dataset.id}`);
      const data = await res.json() as { runs?: Array<EvalRun & { results: EvalResult[] }> };
      const run = data.runs?.find((r) => r.id === runId);
      setDrilldownResults(run?.results ?? []);
    } catch {
      toast.error("Failed to load run results");
    } finally {
      setDrilldownLoading(false);
    }
  }

  return (
    <Card className="glass border-white/10">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <FlaskConical className="w-4 h-4 text-accent" aria-hidden="true" />
            </div>
            <div>
              <CardTitle className="text-sm">{dataset.name}</CardTitle>
              <CardDescription className="text-xs">
                {dataset.caseCount} question{dataset.caseCount !== 1 ? "s" : ""} ·{" "}
                {dataset.runs.length} run{dataset.runs.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0 bg-accent/20 hover:bg-accent/30 text-accent border border-accent/30 text-xs gap-1.5"
            onClick={runEval}
            disabled={running}
          >
            {running
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              : <Play    className="w-3.5 h-3.5"              aria-hidden="true" />
            }
            {running ? "Running…" : "Run eval"}
          </Button>
        </div>
      </CardHeader>

      {latestRun && (
        <CardContent className="pt-0 space-y-4">

          {/* ── Aggregate scores ─────────────────────────────────────────── */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-3">
              <ScoreBadge value={latestRun.avgFaithfulness}       label="Faithfulness" />
              <ScoreBadge value={latestRun.avgAnswerRelevance}    label="Answer Rel." />
              <ScoreBadge value={latestRun.avgRetrievalRelevance} label="Retrieval" />
              <ScoreBadge value={latestRun.avgCitationAccuracy}   label="Citations" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground/50">
                Latest run: {new Date(latestRun.createdAt).toLocaleDateString()}
              </span>
              <span className={cn(
                "text-[11px] font-semibold",
                (latestRun.passedCount ?? 0) / (latestRun.totalCount || 1) >= 0.7
                  ? "text-emerald-400" : "text-amber-400"
              )}>
                {latestRun.passedCount ?? 0}/{latestRun.totalCount ?? dataset.caseCount} passed
              </span>
            </div>
          </div>

          {/* ── Per-question drill-down ──────────────────────────────────── */}
          <div className="border-t border-white/[0.06] pt-3">
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
              onClick={() => toggleDrilldown(latestRun.id)}
              aria-expanded={drilldownRunId === latestRun.id}
            >
              {drilldownRunId === latestRun.id
                ? <ChevronUp   className="w-3 h-3" />
                : <ChevronDown className="w-3 h-3" />
              }
              {drilldownRunId === latestRun.id ? "Hide" : "Show"} per-question results
            </button>

            {drilldownRunId === latestRun.id && (
              <div className="space-y-1.5">
                {drilldownLoading ? (
                  [...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-lg bg-white/5" />
                  ))
                ) : drilldownResults.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 py-2">No per-case results available.</p>
                ) : (
                  drilldownResults.map((result, idx) => (
                    <ResultRow key={result.id} result={result} index={idx} />
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── Run comparison ───────────────────────────────────────────── */}
          {dataset.runs.length > 1 && (
            <div className="border-t border-white/[0.06] pt-3">
              <button
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
                onClick={() => setCompareOpen((v) => !v)}
                aria-expanded={compareOpen}
              >
                {compareOpen
                  ? <ChevronUp   className="w-3 h-3" />
                  : <ChevronDown className="w-3 h-3" />
                }
                Compare all runs ({dataset.runs.length})
              </button>

              {compareOpen && (
                <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-white/[0.07] bg-white/[0.02]">
                        <th className="text-left py-2 px-3 text-muted-foreground/60 font-medium">Run</th>
                        <th className="text-right py-2 px-3 text-muted-foreground/60 font-medium">Faith.</th>
                        <th className="text-right py-2 px-3 text-muted-foreground/60 font-medium">Ans. Rel.</th>
                        <th className="text-right py-2 px-3 text-muted-foreground/60 font-medium">Retrieval</th>
                        <th className="text-right py-2 px-3 text-muted-foreground/60 font-medium">Citations</th>
                        <th className="text-right py-2 px-3 text-muted-foreground/60 font-medium">Passed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataset.runs.map((run, i) => (
                        <tr
                          key={run.id}
                          className={cn(
                            "border-b border-white/[0.04] last:border-0 transition-colors hover:bg-white/[0.02]",
                            i === 0 && "bg-white/[0.01]"
                          )}
                        >
                          <td className="py-2 px-3 text-muted-foreground">
                            {i === 0 && <span className="text-accent mr-1.5" aria-label="latest">●</span>}
                            <span className="truncate max-w-[100px] inline-block align-bottom">
                              {run.label ?? `Run ${dataset.runs.length - i}`}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums"><ScoreCell value={run.avgFaithfulness} /></td>
                          <td className="py-2 px-3 text-right tabular-nums"><ScoreCell value={run.avgAnswerRelevance} /></td>
                          <td className="py-2 px-3 text-right tabular-nums"><ScoreCell value={run.avgRetrievalRelevance} /></td>
                          <td className="py-2 px-3 text-right tabular-nums"><ScoreCell value={run.avgCitationAccuracy} /></td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {run.passedCount ?? 0}/{run.totalCount ?? "?"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EvalPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [kbs, setKbs] = useState<KB[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [kbId, setKbId] = useState("");
  const [questionsText, setQuestionsText] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/eval").then((r) => r.json()),
      fetch("/api/knowledge-bases").then((r) => r.json()),
    ])
      .then(([evalData, kbData]) => {
        setDatasets(Array.isArray(evalData) ? evalData : []);
        setKbs(Array.isArray(kbData) ? kbData : []);
      })
      .catch(() => toast.error("Failed to load eval data"))
      .finally(() => setLoading(false));
  }, []);

  async function createDataset(e: React.FormEvent) {
    e.preventDefault();
    const lines = questionsText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { toast.error("Add at least one question"); return; }

    setCreating(true);
    const res = await fetch("/api/eval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kbId, cases: lines.map((question) => ({ question })) }),
    });
    const data = await res.json() as Dataset & { caseCount?: number };
    setCreating(false);

    if (!res.ok) { toast.error((data as { error?: string }).error ?? "Failed to create dataset"); return; }

    setDatasets((prev) => [{ ...data, caseCount: lines.length, runs: [] }, ...prev]);
    setOpen(false); setName(""); setKbId(""); setQuestionsText("");
    toast.success("Eval dataset created");
  }

  function refreshDataset(id: string) {
    fetch(`/api/eval/${id}`)
      .then((r) => r.json())
      .then((updated: Dataset) => {
        setDatasets((prev) =>
          prev.map((d) => d.id === id ? { ...d, runs: updated.runs ?? d.runs } : d)
        );
      })
      .catch(() => {});
  }

  return (
    <div className="max-w-4xl space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Evaluation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Measure retrieval quality, faithfulness, and answer relevance
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button className="bg-primary hover:bg-primary/90 gap-2">
                <Plus className="w-4 h-4" aria-hidden="true" /> New Dataset
              </Button>
            }
          />
          <DialogContent className="glass border-white/10 max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Eval Dataset</DialogTitle>
            </DialogHeader>
            <form onSubmit={createDataset} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="eval-name">Dataset Name</Label>
                <Input
                  id="eval-name"
                  placeholder="e.g. Product FAQ Eval"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eval-kb">Knowledge Base</Label>
                <select
                  id="eval-kb"
                  value={kbId}
                  onChange={(e) => setKbId(e.target.value)}
                  required
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="" disabled>Select a knowledge base…</option>
                  {kbs.map((kb) => (
                    <option key={kb.id} value={kb.id} className="bg-background">{kb.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eval-questions">
                  Questions{" "}
                  <span className="text-muted-foreground text-xs font-normal">(one per line, max 50)</span>
                </Label>
                <Textarea
                  id="eval-questions"
                  placeholder={"What is the refund policy?\nHow do I contact support?\nWhat are the system requirements?"}
                  value={questionsText}
                  onChange={(e) => setQuestionsText(e.target.value)}
                  className="bg-white/5 border-white/10 min-h-[140px] text-sm font-mono"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {questionsText.split("\n").filter((l) => l.trim()).length} questions
                </p>
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={creating || !kbId}>
                {creating ? "Creating…" : "Create Dataset"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Scoring legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
          Pass: faithfulness ≥ 70% &amp; answer relevance ≥ 70%
        </span>
        <span className="flex items-center gap-1.5">
          <FlaskConical className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
          Scored by GPT-4o-mini as judge (LLM-as-judge, not ground-truth)
        </span>
      </div>

      {/* Dataset list */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl bg-white/5" />
          ))}
        </div>
      ) : datasets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
            <FlaskConical className="w-8 h-8 text-accent" aria-hidden="true" />
          </div>
          <div>
            <p className="font-medium text-lg">No eval datasets yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create a dataset to benchmark your knowledge base
            </p>
          </div>
          <Button onClick={() => setOpen(true)} className="bg-primary hover:bg-primary/90 gap-2">
            <Plus className="w-4 h-4" aria-hidden="true" /> Create your first dataset
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {datasets.map((dataset) => (
            <DatasetCard key={dataset.id} dataset={dataset} onRunStarted={refreshDataset} />
          ))}
        </div>
      )}
    </div>
  );
}
