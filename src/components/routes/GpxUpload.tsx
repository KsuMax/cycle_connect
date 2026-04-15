"use client";

import { useRef, useState } from "react";
import { FileUp, X, AlertTriangle, FileCheck2 } from "lucide-react";

const MAX_GPX_SIZE = 20 * 1024 * 1024; // 20 MB

interface GpxUploadProps {
  /** Current filename of the selected/existing file (for display). */
  currentName: string | null;
  /** Called when the user picks a new file — upload is deferred to the form submit. */
  onChange: (file: File | null) => void;
  /** Called when user wants to clear the existing stored GPX. */
  onClear?: () => void;
}

export function GpxUpload({ currentName, onChange, onClear }: GpxUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);

  const handleFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (ext !== "gpx") {
      setError("Файл должен иметь расширение .gpx");
      return;
    }
    if (file.size > MAX_GPX_SIZE) {
      setError(`Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Максимум 20 МБ`);
      return;
    }
    setError(null);
    setPendingName(file.name);
    onChange(file);
  };

  const displayName = pendingName ?? currentName;
  const isExisting = !pendingName && !!currentName;

  return (
    <div>
      {displayName ? (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-[#E4E4E7] bg-[#F5F4F1]">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: "#E6FAF9", color: "#0BBFB5" }}>
            <FileCheck2 size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[#1C1C1E] truncate">{displayName}</div>
            <div className="text-xs text-[#71717A]">
              {isExisting ? "Текущий файл" : "Будет сохранён при публикации"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setPendingName(null);
              onChange(null);
              if (isExisting && onClear) onClear();
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[#A1A1AA] hover:bg-white transition-colors"
            aria-label="Удалить файл"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-[#E4E4E7] rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#F4632A] transition-colors py-6"
        >
          <FileUp size={20} className="text-[#A1A1AA]" />
          <div className="text-sm text-[#71717A] text-center px-4">
            Загрузи <span className="font-medium text-[#1C1C1E]">.gpx</span> файл маршрута
            <br />
            <span className="text-xs text-[#A1A1AA]">Экспортируй из MapMagic и перетащи сюда</span>
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      {error && (
        <div className="mt-2 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
          <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
          <div className="text-xs text-red-600">{error}</div>
        </div>
      )}
    </div>
  );
}
