"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface AvatarLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export function AvatarLightbox({ src, alt, onClose }: AvatarLightboxProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
        aria-label="Закрыть"
      >
        <X size={20} />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[85vh] rounded-2xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
