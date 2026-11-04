import { useEffect, useState } from "react";

export type UnifiendTheme = "light" | "dark";
export const UNIFIEND_THEME_KEY = "ogenic.webdev.theme.v1";

function systemTheme(): UnifiendTheme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialTheme(): UnifiendTheme {
  try {
    const saved = localStorage.getItem(UNIFIEND_THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* storage may be unavailable */ }
  return systemTheme();
}

function applyTheme(theme: UnifiendTheme) {
  const root = document.documentElement;
  root.dataset.ogTheme = theme;
  root.style.colorScheme = theme;
}

export default function UnifiendThemeToggle() {
  const [theme, setTheme] = useState<UnifiendTheme>(initialTheme);

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(UNIFIEND_THEME_KEY, theme); } catch { /* no-op */ }
  }, [theme]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== UNIFIEND_THEME_KEY) return;
      if (event.newValue === "light" || event.newValue === "dark") setTheme(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const next = theme === "dark" ? "light" : "dark";
  return <button
    type="button"
    className="unifiendThemeToggle"
    aria-label={`Switch to ${next} mode`}
    title={`Switch to ${next} mode`}
    data-theme={theme}
    onClick={() => setTheme(next)}
  >
    <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    <b>{theme === "dark" ? "Light" : "Dark"}</b>
  </button>;
}
