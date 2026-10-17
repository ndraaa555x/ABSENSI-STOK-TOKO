"use client";

import { useEffect, useState } from "react";

type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "ndraaaid-theme-mode";

function applyTheme(mode: ThemeMode) {
  const systemPrefersLight =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: light)").matches;
  const theme = mode === "system" ? (systemPrefersLight ? "light" : "dark") : mode;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export default function MotionSystem() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const initial: ThemeMode =
      saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
    setMode(initial);
    applyTheme(initial);

    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onPreferenceChange = () => {
      if ((window.localStorage.getItem(STORAGE_KEY) ?? "system") === "system") {
        applyTheme("system");
      }
    };
    media.addEventListener("change", onPreferenceChange);
    return () => media.removeEventListener("change", onPreferenceChange);
  }, []);

  function cycleTheme() {
    const next: ThemeMode =
      mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    setMode(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  const labels: Record<ThemeMode, string> = {
    system: "Tema adaptif",
    light: "Tema terang",
    dark: "Tema gelap",
  };
  const symbols: Record<ThemeMode, string> = {
    system: "◐",
    light: "☼",
    dark: "☾",
  };

  return (
    <button
      className="ndraaaid-theme-control"
      type="button"
      onClick={cycleTheme}
      aria-label={`Mode tampilan saat ini: ${labels[mode]}. Tekan untuk mengganti tema.`}
      title={`Mode tampilan: ${labels[mode]}`}
    >
      <span className="ndraaaid-theme-control-symbol" aria-hidden="true">{symbols[mode]}</span>
      <span>{labels[mode]}</span>
    </button>
  );
}
