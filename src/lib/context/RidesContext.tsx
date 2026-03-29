"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

const STORAGE_KEY = "cc_rides";

interface RidesContextValue {
  rides: Set<string>;
  toggleRide: (routeId: string) => void;
  hasRidden: (routeId: string) => boolean;
}

const RidesContext = createContext<RidesContextValue | null>(null);

export function RidesProvider({ children }: { children: ReactNode }) {
  const [rides, setRides] = useState<Set<string>>(new Set());

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setRides(new Set(JSON.parse(stored)));
    } catch {}
  }, []);

  // Persist on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(rides)));
  }, [rides]);

  const toggleRide = (routeId: string) => {
    setRides((prev) => {
      const next = new Set(prev);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  };

  const hasRidden = (routeId: string) => rides.has(routeId);

  return (
    <RidesContext.Provider value={{ rides, toggleRide, hasRidden }}>
      {children}
    </RidesContext.Provider>
  );
}

export function useRides() {
  const ctx = useContext(RidesContext);
  if (!ctx) throw new Error("useRides must be used within RidesProvider");
  return ctx;
}
