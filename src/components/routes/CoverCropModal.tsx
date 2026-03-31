"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";

const CROP_ASPECT = 16 / 9;
const MAX_ZOOM = 4;

interface CropState {
  x: number;
  y: number;
  scale: number;
}

interface CropFrame {
  left: number;
  top: number;
  width: number;
  height: number;
  cw: number;
  ch: number;
}

interface Props {
  file: File;
  onConfirm: (croppedFile: File) => void;
  onCancel: () => void;
}

export function CoverCropModal({ file, onConfirm, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgSrc, setImgSrc] = useState("");
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [cropFrame, setCropFrame] = useState<CropFrame | null>(null);
  const [state, setState] = useState<CropState>({ x: 0, y: 0, scale: 1 });
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load image from file
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    const img = new Image();
    img.onload = () => setImgEl(img);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Compute crop frame dimensions and initial scale
  const computeFrame = useCallback(() => {
    if (!containerRef.current || !imgEl) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const pad = 28;
    let cropW = cw - pad * 2;
    let cropH = cropW / CROP_ASPECT;
    if (cropH > ch - pad * 2) {
      cropH = ch - pad * 2;
      cropW = cropH * CROP_ASPECT;
    }
    const frame: CropFrame = {
      left: (cw - cropW) / 2,
      top: (ch - cropH) / 2,
      width: cropW,
      height: cropH,
      cw,
      ch,
    };
    setCropFrame(frame);
    const baseS = Math.max(cropW / imgEl.naturalWidth, cropH / imgEl.naturalHeight);
    setState({ x: 0, y: 0, scale: baseS });
  }, [imgEl]);

  useEffect(() => {
    computeFrame();
    const observer = new ResizeObserver(computeFrame);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [computeFrame]);

  const getBaseScale = useCallback(() => {
    if (!imgEl || !cropFrame) return 1;
    return Math.max(cropFrame.width / imgEl.naturalWidth, cropFrame.height / imgEl.naturalHeight);
  }, [imgEl, cropFrame]);

  // Clamp offset so image always fully covers the crop area
  const clamp = useCallback(
    (x: number, y: number, scale: number): CropState => {
      if (!imgEl || !cropFrame) return { x, y, scale };
      const { cw, ch, left: cl, top: ct, width: cropW, height: cropH } = cropFrame;
      const imgW = imgEl.naturalWidth * scale;
      const imgH = imgEl.naturalHeight * scale;
      const maxX = cl - cw / 2 + imgW / 2;
      const minX = cl + cropW - cw / 2 - imgW / 2;
      const maxY = ct - ch / 2 + imgH / 2;
      const minY = ct + cropH - ch / 2 - imgH / 2;
      return {
        x: Math.max(minX, Math.min(maxX, x)),
        y: Math.max(minY, Math.min(maxY, y)),
        scale,
      };
    },
    [imgEl, cropFrame]
  );

  // Pointer tracking for pan + pinch
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const lastPinchDistRef = useRef<number | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const pts = pointersRef.current;
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId)!;
      const curr = { x: e.clientX, y: e.clientY };
      pts.set(e.pointerId, curr);

      if (pts.size === 1) {
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const { x, y, scale } = stateRef.current;
        setState(clamp(x + dx, y + dy, scale));
      } else if (pts.size === 2) {
        const pArr = Array.from(pts.values());
        const dist = Math.hypot(pArr[1].x - pArr[0].x, pArr[1].y - pArr[0].y);
        if (lastPinchDistRef.current !== null) {
          const ratio = dist / lastPinchDistRef.current;
          const base = getBaseScale();
          const { x, y, scale } = stateRef.current;
          const newScale = Math.max(base, Math.min(base * MAX_ZOOM, scale * ratio));
          setState(clamp(x, y, newScale));
        }
        lastPinchDistRef.current = dist;
      }
    },
    [clamp, getBaseScale]
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) lastPinchDistRef.current = null;
  }, []);

  // Scroll wheel zoom on desktop
  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const base = getBaseScale();
      const { x, y, scale } = stateRef.current;
      const factor = e.deltaY > 0 ? 0.93 : 1.07;
      const newScale = Math.max(base, Math.min(base * MAX_ZOOM, scale * factor));
      setState(clamp(x, y, newScale));
    },
    [clamp, getBaseScale]
  );

  // Attach wheel as non-passive to allow preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  // Slider zoom
  const sliderValue =
    cropFrame && imgEl
      ? Math.max(0, Math.min(1, (state.scale / getBaseScale() - 1) / (MAX_ZOOM - 1)))
      : 0;

  const onSliderChange = (val: number) => {
    const base = getBaseScale();
    const newScale = base * (1 + val * (MAX_ZOOM - 1));
    const { x, y } = stateRef.current;
    setState(clamp(x, y, newScale));
  };

  // Export cropped image via canvas
  const handleConfirm = () => {
    if (!imgEl || !cropFrame) return;
    const { left: cl, top: ct, width: cropW, height: cropH, cw, ch } = cropFrame;
    const { x, y, scale } = stateRef.current;
    const displayW = imgEl.naturalWidth * scale;
    const displayH = imgEl.naturalHeight * scale;
    const imgLeft = cw / 2 + x - displayW / 2;
    const imgTop = ch / 2 + y - displayH / 2;
    const srcScale = imgEl.naturalWidth / displayW;
    const srcX = Math.max(0, (cl - imgLeft) * srcScale);
    const srcY = Math.max(0, (ct - imgTop) * srcScale);
    const srcW = Math.min(cropW * srcScale, imgEl.naturalWidth - srcX);
    const srcH = Math.min(cropH * srcScale, imgEl.naturalHeight - srcY);

    const outW = Math.min(1600, Math.round(srcW));
    const outH = Math.round(outW / CROP_ASPECT);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(imgEl, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const name = file.name.replace(/\.[^.]+$/, ".jpg");
        onConfirm(new File([blob], name, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  };

  // Image CSS position based on current state
  const imgDisplayW = imgEl ? imgEl.naturalWidth * state.scale : 0;
  const imgDisplayH = imgEl ? imgEl.naturalHeight * state.scale : 0;
  const imgLeft = cropFrame ? cropFrame.cw / 2 + state.x - imgDisplayW / 2 : 0;
  const imgTop = cropFrame ? cropFrame.ch / 2 + state.y - imgDisplayH / 2 : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" style={{ touchAction: "none" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X size={20} />
        </button>
        <span className="text-white text-sm font-medium">Кадрировать обложку</span>
        <button
          type="button"
          onClick={handleConfirm}
          className="px-4 py-1.5 rounded-full text-sm font-semibold text-white transition-opacity active:opacity-80"
          style={{ background: "#F4632A" }}
        >
          Готово
        </button>
      </div>

      {/* Crop interaction area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden select-none"
        style={{ cursor: "grab", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Image layer */}
        {imgSrc && imgEl && cropFrame && (
          <img
            src={imgSrc}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: imgLeft,
              top: imgTop,
              width: imgDisplayW,
              height: imgDisplayH,
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Dark overlay with crop hole (4 rectangles) */}
        {cropFrame && (
          <div className="absolute inset-0 pointer-events-none">
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                height: cropFrame.top,
                background: "rgba(0,0,0,0.6)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: cropFrame.top + cropFrame.height,
                bottom: 0,
                background: "rgba(0,0,0,0.6)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                width: cropFrame.left,
                top: cropFrame.top,
                height: cropFrame.height,
                background: "rgba(0,0,0,0.6)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: cropFrame.left + cropFrame.width,
                right: 0,
                top: cropFrame.top,
                height: cropFrame.height,
                background: "rgba(0,0,0,0.6)",
              }}
            />

            {/* Crop frame border + rule-of-thirds grid */}
            <div
              style={{
                position: "absolute",
                left: cropFrame.left,
                top: cropFrame.top,
                width: cropFrame.width,
                height: cropFrame.height,
                border: "2px solid rgba(255,255,255,0.9)",
                boxSizing: "border-box",
              }}
            >
              {/* Rule-of-thirds lines */}
              <div
                style={{
                  position: "absolute",
                  left: "33.33%",
                  top: 0,
                  bottom: 0,
                  borderLeft: "1px solid rgba(255,255,255,0.25)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "66.66%",
                  top: 0,
                  bottom: 0,
                  borderLeft: "1px solid rgba(255,255,255,0.25)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "33.33%",
                  left: 0,
                  right: 0,
                  borderTop: "1px solid rgba(255,255,255,0.25)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "66.66%",
                  left: 0,
                  right: 0,
                  borderTop: "1px solid rgba(255,255,255,0.25)",
                }}
              />
              {/* Corner handles */}
              <div
                style={{
                  position: "absolute",
                  top: -2,
                  left: -2,
                  width: 18,
                  height: 18,
                  borderTop: "3px solid white",
                  borderLeft: "3px solid white",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  width: 18,
                  height: 18,
                  borderTop: "3px solid white",
                  borderRight: "3px solid white",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: -2,
                  left: -2,
                  width: 18,
                  height: 18,
                  borderBottom: "3px solid white",
                  borderLeft: "3px solid white",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 18,
                  height: 18,
                  borderBottom: "3px solid white",
                  borderRight: "3px solid white",
                }}
              />
            </div>
          </div>
        )}

        {/* Loading state */}
        {!imgEl && (
          <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">
            Загрузка...
          </div>
        )}
      </div>

      {/* Zoom slider */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-4">
        <button
          type="button"
          className="p-1 text-white/50 hover:text-white/80 transition-colors"
          onClick={() => {
            const base = getBaseScale();
            const { x, y, scale } = stateRef.current;
            setState(clamp(x, y, Math.max(base, scale * 0.87)));
          }}
        >
          <ZoomOut size={18} />
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={sliderValue}
          onChange={(e) => onSliderChange(parseFloat(e.target.value))}
          className="flex-1 cursor-pointer h-1"
          style={{ accentColor: "#F4632A" }}
        />
        <button
          type="button"
          className="p-1 text-white/50 hover:text-white/80 transition-colors"
          onClick={() => {
            const base = getBaseScale();
            const { x, y, scale } = stateRef.current;
            setState(clamp(x, y, Math.min(base * MAX_ZOOM, scale * 1.15)));
          }}
        >
          <ZoomIn size={18} />
        </button>
      </div>

      {/* Hint */}
      <div className="shrink-0 pb-4 text-center text-xs text-white/30">
        Перетащи и масштабируй фото под рамку
      </div>
    </div>
  );
}
