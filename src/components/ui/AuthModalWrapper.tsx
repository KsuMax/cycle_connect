"use client";

import { useAuth } from "@/lib/context/AuthContext";
import { AuthModalProvider } from "@/components/ui/AuthModal";

export function AuthModalWrapper({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <AuthModalProvider user={user}>{children}</AuthModalProvider>;
}
