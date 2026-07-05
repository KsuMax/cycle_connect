"use client";

import { Check } from "lucide-react";

export interface WizardStep {
  step: number;
  label: string;
}

interface StepIndicatorProps {
  steps: WizardStep[];
  current: number;
}

export function StepIndicator({ steps, current }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 mb-6">
      {steps.map((s, idx) => {
        const active = s.step === current;
        const done = s.step < current;
        return (
          <div key={s.step} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2 shrink-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors"
                style={
                  done
                    ? { backgroundColor: "#0BBFB5", color: "white" }
                    : active
                    ? { backgroundColor: "#1C1C1E", color: "white" }
                    : { backgroundColor: "#E4E4E7", color: "#A1A1AA" }
                }
              >
                {done ? <Check size={13} /> : s.step}
              </div>
              <span
                className="text-xs font-medium whitespace-nowrap hidden xs:inline sm:inline"
                style={{ color: active ? "#1C1C1E" : "#A1A1AA" }}
              >
                {s.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className="h-px flex-1 mx-2 sm:mx-3"
                style={{ backgroundColor: done ? "#0BBFB5" : "#E4E4E7" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
