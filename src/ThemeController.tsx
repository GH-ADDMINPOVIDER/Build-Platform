import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Theme = "light" | "dark";

const THEME_KEY = "ogenic.webdev.theme.v1";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* storage can be unavailable in hardened browsers */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function findActionTarget() {
  return (
    document.querySelector<HTMLElement>(".providerConnectHeader .pcHeaderActions") ||
    document.querySelector<HTMLElement>(".connectorPanelHeader > div:last-child") ||
    document.querySelector<HTMLElement>(".cpHeaderActions") ||
    null
  );
}

export default function ThemeController() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.ogTheme = theme;
    root.style.colorScheme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* noop */ }
  }, [theme]);

  useEffect(() => {
    const refreshTarget = () => setTarget(findActionTarget());
    refreshTarget();
    const observer = new MutationObserver(refreshTarget);
    observer.observe(document.body, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  const button = (
    <button
      type="button"
      className="cpThemeToggle"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      <b>{theme === "dark" ? "Light" : "Dark"}</b>
    </button>
  );

  return target ? createPortal(button, target) : <div className="cpThemeFallback">{button}</div>;
}
