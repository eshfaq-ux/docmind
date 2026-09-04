"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, AlertCircle, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface UploadingFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  done?: boolean;
  error?: string;
}

interface UploadZoneProps {
  kbId: string;
  onUploaded: (docId: string, fileName: string) => void;
}

const ACCEPTED = {
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

const MAX_SIZE = 50 * 1024 * 1024;

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}

export function UploadZone({ kbId, onUploaded }: UploadZoneProps) {
  const [uploading, setUploading] = useState<UploadingFile[]>([]);

  const uploadFile = useCallback(async (file: File) => {
    const id = crypto.randomUUID();
    setUploading((p) => [...p, { id, name: file.name, size: file.size, progress: 0 }]);

    try {
      // Step 1: Upload file via server proxy (avoids CORS issues with B2/R2)
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kbId", kbId);

      const uploadRes = await fetch("/api/upload-proxy", {
        method: "POST",
        body: formData,
      });

      setUploading((p) => p.map((f) => f.id === id ? { ...f, progress: 80 } : f));

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Upload failed");
      }

      const { documentId } = await uploadRes.json();

      // Step 2: Trigger ingestion
      setUploading((p) => p.map((f) => f.id === id ? { ...f, progress: 95 } : f));
      const finalizeRes = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      if (!finalizeRes.ok) {
        const err = await finalizeRes.json().catch(() => ({})) as { error?: string; code?: string };
        if (err.code === "DUPLICATE") {
          setUploading((p) => p.filter((f) => f.id !== id));
          toast.error(`${file.name}: Already uploaded to this workspace`);
          return;
        }
        throw new Error(err.error ?? "Failed to start ingestion");
      }

      setUploading((p) => p.map((f) => f.id === id ? { ...f, progress: 100, done: true } : f));
      toast.success(`${file.name} uploaded — processing started`);
      onUploaded(documentId, file.name);

      setTimeout(() => setUploading((p) => p.filter((f) => f.id !== id)), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploading((p) => p.map((f) => f.id === id ? { ...f, error: msg } : f));
      toast.error(`${file.name}: ${msg}`);
    }
  }, [kbId, onUploaded]);

  const onDrop = useCallback(
    (accepted: File[], rejected: import("react-dropzone").FileRejection[]) => {
      rejected.forEach(({ file, errors }) => toast.error(`${file.name}: ${errors[0]?.message}`));
      accepted.forEach(uploadFile);
    },
    [uploadFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPTED, maxSize: MAX_SIZE, multiple: true,
  });

  return (
    <div className="space-y-2.5">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 cursor-pointer transition-all duration-200 select-none",
          isDragActive
            ? "border-primary/60 bg-primary/[0.06] scale-[1.005]"
            : "border-white/[0.09] bg-white/[0.02] hover:border-primary/30 hover:bg-primary/[0.03]"
        )}
      >
        <input {...getInputProps()} />

        <div className={cn(
          "w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200",
          isDragActive ? "bg-primary/20 scale-110" : "bg-white/[0.05]"
        )}>
          <Upload className={cn("w-5 h-5 transition-colors duration-200", isDragActive ? "text-primary" : "text-muted-foreground/50")} />
        </div>

        <div className="text-center space-y-1">
          <p className={cn("text-[13.5px] font-medium transition-colors duration-200", isDragActive ? "text-primary" : "text-foreground/70")}>
            {isDragActive ? "Drop files to upload" : "Drag & drop files here"}
          </p>
          <p className="text-[11.5px] text-muted-foreground/50">
            PDF, DOCX, TXT, MD · max 50 MB each
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="text-[12px] font-medium px-3.5 py-1.5 rounded-xl border border-white/[0.10] hover:border-primary/30 hover:bg-primary/[0.06] hover:text-primary text-muted-foreground transition-all duration-150"
        >
          Browse files
        </button>
      </div>

      {/* Upload progress items */}
      {uploading.length > 0 && (
        <div className="space-y-2">
          {uploading.map((f) => (
            <div
              key={f.id}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all duration-300",
                f.error
                  ? "bg-rose-500/[0.05] border-rose-500/20"
                  : f.done
                  ? "bg-emerald-500/[0.05] border-emerald-500/20"
                  : "bg-white/[0.03] border-white/[0.07]"
              )}
            >
              {/* Icon */}
              <div className="shrink-0">
                {f.error
                  ? <AlertCircle className="w-4 h-4 text-rose-400" />
                  : f.done
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  : <FileText className="w-4 h-4 text-primary/60" />
                }
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium truncate">{f.name}</span>
                  <span className="text-[11px] text-muted-foreground/50 shrink-0">{fmtBytes(f.size)}</span>
                </div>
                {f.error ? (
                  <p className="text-[11px] text-rose-400">{f.error}</p>
                ) : (
                  <div className="h-[3px] w-full rounded-full bg-white/[0.08] overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        f.done ? "bg-emerald-400" : "bg-primary"
                      )}
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Dismiss */}
              {(f.error || f.done) && (
                <button
                  onClick={() => setUploading((p) => p.filter((u) => u.id !== f.id))}
                  className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors duration-150"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
