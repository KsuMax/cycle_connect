"use client";

import { useRef, useState } from "react";
import { Upload, X, ImagePlus, AlertTriangle } from "lucide-react";
import { filterValidImageFiles } from "@/lib/upload";

interface ImageUploadProps {
  images: string[]; // preview URLs
  onChange: (previews: string[], files: File[]) => void;
}

export function ImageUpload({ images, onChange }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const { valid: newFiles, errors } = filterValidImageFiles(Array.from(incoming));
    setUploadErrors(errors);
    if (newFiles.length === 0) return;
    const newPreviews = newFiles.map((f) => URL.createObjectURL(f));
    const merged = { files: [...files, ...newFiles], previews: [...images, ...newPreviews] };
    setFiles(merged.files);
    onChange(merged.previews, merged.files);
  };

  const removeImage = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    const newPreviews = images.filter((_, i) => i !== index);
    setFiles(newFiles);
    onChange(newPreviews, newFiles);
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className="relative flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
        style={{ borderColor: dragging ? "#F4632A" : "#E4E4E7", backgroundColor: dragging ? "#FFF5F2" : "#FAFAF9" }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FFF0EB" }}>
          <ImagePlus size={20} style={{ color: "#F4632A" }} />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-[#1C1C1E]">
            {dragging ? "Отпусти для загрузки" : "Загрузи фотографии маршрута"}
          </p>
          <p className="text-xs text-[#A1A1AA] mt-0.5">Перетащи файлы или нажми. PNG, JPG до 10 МБ</p>
        </div>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden"
          onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {uploadErrors.length > 0 && (
        <div className="mt-2 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
          <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
          <div className="text-xs text-red-600">
            {uploadErrors.map((err, i) => <div key={i}>{err}</div>)}
          </div>
        </div>
      )}

      {images.length > 0 && (
        <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((src, i) => (
            <div key={i} className="relative group aspect-square rounded-xl overflow-hidden border border-[#E4E4E7]">
              <img src={src} alt={`Фото ${i + 1}`} className="w-full h-full object-cover" />
              <button type="button"
                onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                <X size={12} color="white" />
              </button>
              <div className="absolute bottom-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ backgroundColor: "rgba(0,0,0,0.45)", color: "white" }}>
                {i + 1}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => inputRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-[#E4E4E7] flex flex-col items-center justify-center gap-1 hover:border-[#F4632A] hover:bg-[#FFF5F2] transition-colors">
            <Upload size={16} className="text-[#A1A1AA]" />
            <span className="text-[10px] text-[#A1A1AA]">Ещё</span>
          </button>
        </div>
      )}
    </div>
  );
}
