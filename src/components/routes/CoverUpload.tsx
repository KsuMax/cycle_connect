"use client";

import { useRef, useState } from "react";
import { ImagePlus, X, AlertTriangle } from "lucide-react";
import { CoverCropModal } from "./CoverCropModal";
import { validateImageFile } from "@/lib/upload";

interface CoverUploadProps {
  value: string | null;
  onChange: (preview: string | null, file: File | null) => void;
  label?: string;
}

export function CoverUpload({ value, onChange, label = "маршрута" }: CoverUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    const result = validateImageFile(file);
    if (!result.valid) {
      setUploadError(result.error!);
      return;
    }
    setUploadError(null);
    setPendingFile(file);
  };

  const handleCropConfirm = (croppedFile: File) => {
    setPendingFile(null);
    const preview = URL.createObjectURL(croppedFile);
    onChange(preview, croppedFile);
  };

  return (
    <>
      <div>
        {value ? (
          <div className="relative rounded-xl overflow-hidden" style={{ height: 180 }}>
            <img src={value} alt="Обложка" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(null, null)}
              className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-white transition-colors"
              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
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
            className="border-2 border-dashed border-[#E4E4E7] rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#F4632A] transition-colors"
            style={{ height: 140 }}
          >
            <ImagePlus size={24} className="text-[#A1A1AA]" />
            <div className="text-sm text-[#71717A] text-center px-4">
              Загрузи обложку {label}
              <br />
              <span className="text-xs text-[#A1A1AA]">Любое фото — мы поможем обрезать</span>
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        {uploadError && (
          <div className="mt-2 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <div className="text-xs text-red-600">{uploadError}</div>
          </div>
        )}
      </div>

      {pendingFile && (
        <CoverCropModal
          file={pendingFile}
          onConfirm={handleCropConfirm}
          onCancel={() => setPendingFile(null)}
        />
      )}
    </>
  );
}
