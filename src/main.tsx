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
