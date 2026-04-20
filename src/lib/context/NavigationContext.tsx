"use client";

import { createContext, useCallback, useContext, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

type NavigateOptions = { replace?: boolean };

type NavigationContextValue = {
  isPending: boolean;
  pendingHref: string | null;
  navigate: (href: string, options?: NavigateOptions) => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const navigate = useCallback(
    (href: string, options?: NavigateOptions) => {
      setPendingHref(href);
      startTransition(() => {
        if (options?.replace) {
          router.replace(href);
        } else {
          router.push(href);
        }
      });
    },
    [router]
  );

  return (
    <NavigationContext.Provider value={{ isPending, pendingHref, navigate }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return ctx;
}
