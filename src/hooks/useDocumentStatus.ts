"use client";

import { useEffect, useRef } from "react";

interface DocStatus {
  id: string;
  status: string;
  chunkCount: number;
  errorMessage?: string | null;
}

const TERMINAL_STATUSES = new Set(["ready", "failed"]);

/**
 * Polls /api/documents/[id]/status every 2s until status is terminal.
 * Max 60 attempts (~2 minutes) before giving up.
 * Calls onUpdate whenever status changes.
 */
export function useDocumentStatus(
  documentId: string | null,
  onUpdate: (status: DocStatus) => void
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);
  // Keep onUpdate in a ref so callers don't need to memoize it
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const MAX_ATTEMPTS = 60;

  useEffect(() => {
    if (!documentId) return;

    const poll = async () => {
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        clearInterval(intervalRef.current!);
        return;
      }
      attemptsRef.current++;

      try {
        const res = await fetch(`/api/documents/${documentId}/status`);
        if (!res.ok) return;
        const data: DocStatus = await res.json();
        onUpdateRef.current(data);

        if (TERMINAL_STATUSES.has(data.status)) {
          clearInterval(intervalRef.current!);
        }
      } catch {
        // Network error — keep polling
      }
    };

    poll(); // Immediate first check
    intervalRef.current = setInterval(poll, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [documentId]);
}
