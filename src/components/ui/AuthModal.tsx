"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bike } from "lucide-react";

interface AuthModalContextValue {
  /** Call to require auth before an action. Returns false if not logged in (shows modal). */
  requireAuth: (actionLabel: string) => boolean;
}

const AuthModalContext = createContext<AuthModalContextValue>({ requireAuth: () => true });

export function useAuthModal() {
  return useContext(AuthModalContext);
}

export function AuthModalProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { id: string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");

  const requireAuth = useCallback(
    (actionLabel: string): boolean => {
      if (user) return true;
      setLabel(actionLabel);
      setOpen(true);
      return false;
    },
    [user],
  );

  const handleLogin = () => {
    const returnUrl = window.location.pathname + window.location.search;
    setOpen(false);
    router.push(`/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  };

  const handleRegister = () => {
    setOpen(false);
    router.push("/auth/register");
  };

  return (
    <AuthModalContext.Provider value={{ requireAuth }}>
      {children}

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[90] p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "#FFF0EB" }}
              >
                <Bike size={24} style={{ color: "#F4632A" }} />
              </div>
            </div>

            <h2 className="text-lg font-bold text-[#1C1C1E] text-center mb-1">
              Нужен аккаунт
            </h2>
            <p className="text-sm text-[#71717A] text-center mb-5">
              {label ? `Чтобы ${label}, войди или зарегистрируйся` : "Войди или зарегистрируйся, чтобы продолжить"}
            </p>

            <div className="space-y-2">
              <button
                onClick={handleLogin}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#F4632A" }}
              >
                Войти
              </button>
              <button
                onClick={handleRegister}
                className="w-full py-2.5 rounded-xl text-sm font-semibold border border-[#E4E4E7] text-[#71717A] hover:bg-[#F5F4F1] transition-colors"
              >
                Зарегистрироваться
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthModalContext.Provider>
  );
}
