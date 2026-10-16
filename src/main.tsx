// Fonts are self-hosted (npm @fontsource) so no third-party request is made.
// Imported here, not in index.css: Tailwind 4 inlines CSS @imports and loses the font file paths.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-800.css";
import "@fontsource/playfair-display/latin-600.css";
import "@fontsource/playfair-display/latin-700.css";
import "@fontsource/playfair-display/latin-800.css";
import "@fontsource/cairo/latin-400.css";
import "@fontsource/cairo/arabic-400.css";
import "@fontsource/cairo/latin-500.css";
import "@fontsource/cairo/arabic-500.css";
import "@fontsource/cairo/latin-600.css";
import "@fontsource/cairo/arabic-600.css";
import "@fontsource/cairo/latin-700.css";
import "@fontsource/cairo/arabic-700.css";
import "@fontsource/cairo/latin-800.css";
import "@fontsource/cairo/arabic-800.css";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initErrorReporting } from "./lib/errorReporting";

initErrorReporting();

// A tab left open across a deploy asks for chunk files the new build no longer has (the host
// answers with index.html, so the dynamic import fails). Reload once to pick up the new build.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  try {
    if (sessionStorage.getItem("chunk-reload") === "1") return;
    sessionStorage.setItem("chunk-reload", "1");
  } catch {
    return;
  }
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
