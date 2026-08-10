"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Drag-and-drop upload zone. Purely client-side — it hands selected File
 * objects back to the caller and never uploads to any service.
 */
export function UploadArea({
  onFiles,
  accept,
  multiple = true,
  hint = "PNG, JPG, MP4 or PDF up to 50MB",
  compact = false,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  hint?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    onFiles(Array.from(list));
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Upload media"
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-colors",
        compact ? "px-4 py-6" : "px-6 py-10",
        dragging
          ? "border-brand bg-brand-soft"
          : "border-border-strong bg-surface-muted/50 hover:border-brand/60 hover:bg-brand-soft/40",
      )}
    >
      <div
        className={cn(
          "mb-3 flex items-center justify-center rounded-xl bg-surface text-brand shadow-sm",
          compact ? "h-10 w-10" : "h-12 w-12",
        )}
      >
        <UploadCloud className={compact ? "h-5 w-5" : "h-6 w-6"} aria-hidden />
      </div>
      <p className="text-sm font-medium text-ink">
        {dragging ? "Drop files to upload" : "Drag & drop or click to browse"}
      </p>
      <p className="mt-1 text-xs text-ink-subtle">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
