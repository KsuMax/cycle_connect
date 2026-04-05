"use client";

import { useState, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, Images } from "lucide-react";
import { proxyImageUrl } from "@/lib/supabase";

interface RouteGalleryProps {
  images: string[];
}

export function RouteGallery({ images: rawImages }: RouteGalleryProps) {
  const images = useMemo(() => rawImages.map((url) => proxyImageUrl(url) ?? url), [rawImages]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  const openLightbox = (i: number) => setLightboxIndex(i);
  const closeLightbox = () => setLightboxIndex(null);
  const prev = () => setLightboxIndex((i) => (i !== null ? (i - 1 + images.length) % images.length : 0));
  const next = () => setLightboxIndex((i) => (i !== null ? (i + 1) % images.length : 0));

  return (
    <>
      <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Images size={16} style={{ color: "#F4632A" }} />
          <h2 className="font-semibold text-[#1C1C1E]">Фотографии</h2>
          <span className="text-xs text-[#A1A1AA] bg-[#F5F4F1] px-2 py-0.5 rounded-full font-medium">
            {images.length}
          </span>
        </div>

        {/* Grid layout */}
        {images.length === 1 && (
          <button onClick={() => openLightbox(0)} className="block w-full">
            <img
              src={images[0]}
              alt="Фото маршрута"
              className="w-full h-64 object-cover rounded-xl hover:opacity-95 transition-opacity"
            />
          </button>
        )}

        {images.length === 2 && (
          <div className="grid grid-cols-2 gap-2">
            {images.map((src, i) => (
              <button key={i} onClick={() => openLightbox(i)}>
                <img
                  src={src}
                  alt={`Фото ${i + 1}`}
                  className="w-full h-48 object-cover rounded-xl hover:opacity-95 transition-opacity"
                />
              </button>
            ))}
          </div>
        )}

        {images.length >= 3 && (
          <div className="grid grid-cols-3 gap-2">
            {/* First large */}
            <button onClick={() => openLightbox(0)} className="col-span-2 row-span-1">
              <img
                src={images[0]}
                alt="Фото 1"
                className="w-full h-52 object-cover rounded-xl hover:opacity-95 transition-opacity"
              />
            </button>
            {/* Side column */}
            <div className="flex flex-col gap-2">
              <button onClick={() => openLightbox(1)}>
                <img
                  src={images[1]}
                  alt="Фото 2"
                  className="w-full object-cover rounded-xl hover:opacity-95 transition-opacity"
                  style={{ height: images.length > 3 ? 96 : 200 }}
                />
              </button>
              {images.length >= 3 && (
                <button onClick={() => openLightbox(2)} className="relative">
                  <img
                    src={images[2]}
                    alt="Фото 3"
                    className="w-full object-cover rounded-xl hover:opacity-95 transition-opacity"
                    style={{ height: images.length > 3 ? 96 : 200 }}
                  />
                  {images.length > 3 && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                      <span className="text-white font-bold text-lg">+{images.length - 3}</span>
                    </div>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={closeLightbox}
        >
          {/* Close */}
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors z-10"
            onClick={closeLightbox}
          >
            <X size={28} />
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {lightboxIndex + 1} / {images.length}
          </div>

          {/* Prev */}
          {images.length > 1 && (
            <button
              className="absolute left-4 text-white/70 hover:text-white transition-colors z-10 p-2"
              onClick={(e) => { e.stopPropagation(); prev(); }}
            >
              <ChevronLeft size={36} />
            </button>
          )}

          {/* Image */}
          <img
            src={images[lightboxIndex]}
            alt={`Фото ${lightboxIndex + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next */}
          {images.length > 1 && (
            <button
              className="absolute right-4 text-white/70 hover:text-white transition-colors z-10 p-2"
              onClick={(e) => { e.stopPropagation(); next(); }}
            >
              <ChevronRight size={36} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
