"use client";

import { useEffect, useState } from "react";
import { useNavigation } from "@/lib/context/NavigationContext";

export function TopProgressBar() {
  const { isPending } = useNavigation();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isPending) {
      setVisible(true);
      setProgress(10);
      const step1 = setTimeout(() => setProgress(40), 100);
      const step2 = setTimeout(() => setProgress(70), 400);
      const step3 = setTimeout(() => setProgress(85), 900);
      return () => {
        clearTimeout(step1);
        clearTimeout(step2);
        clearTimeout(step3);
      };
    }

    if (visible) {
      setProgress(100);
      const hide = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 200);
      return () => clearTimeout(hide);
    }
  }, [isPending, visible]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[100] h-[3px] pointer-events-none"
      style={{ background: "transparent" }}
    >
      <div
        className="h-full"
        style={{
          width: `${progress}%`,
          background: "linear-gradient(90deg, #F4632A 0%, #FF8F5E 100%)",
          boxShadow: "0 0 8px 0 rgba(244, 99, 42, 0.6)",
          transition: progress === 100
            ? "width 200ms ease-out, opacity 200ms ease-out"
            : "width 400ms ease-out",
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
