"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import type { ThemeMode } from "./roadmap-data";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const useClientLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within Providers");
  return context;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    applyTheme(next);
  }, []);

  useClientLayoutEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme("system");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [setTheme, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
