"use client";

import { useRef, useState } from "react";
import { ImagePlus, X, AlertCircle } from "lucide-react";

interface CoverUploadProps {
  value: string | null;
  onChange: (preview: string | null, file: File | null) => void;
}

function checkLandscape(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img.width >= img.height * 1.2);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

export function CoverUpload({ value, onChange }: CoverUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Только изображения");
      return;
    }
    const ok = await checkLandscape(file);
    if (!ok) {
      setError("Нужно горизонтальное фото — ширина должна быть заметно больше высоты");
      return;
    }
    onChange(URL.createObjectURL(file), file);
  };

  return (
    <div>
      {value ? (
        <div className="relative rounded-xl overflow-hidden" style={{ height: 180 }}>
          <img src={value} alt="Обложка" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null, null)}
            className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-white transition-colors"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-[#E4E4E7] rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#F4632A] transition-colors"
          style={{ height: 140 }}>
          <ImagePlus size={24} className="text-[#A1A1AA]" />
          <div className="text-sm text-[#71717A] text-center px-4">
            Загрузи обложку маршрута<br />
            <span className="text-xs text-[#A1A1AA]">Только горизонтальный формат (шире, чем высокое)</span>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
          <AlertCircle size={13} /> {error}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </div>
  );
}
