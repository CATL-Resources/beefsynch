import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

// Sentry: only initializes when VITE_SENTRY_DSN is set in the build env.
// No-op until the DSN lands in Vercel.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  });
}

// After a Lovable redeploy, the running tab still references the old chunk hashes.
// When the user navigates to a lazy-loaded route, Vite fails to fetch the dynamic
// import and emits `vite:preloadError`. Without a handler the failure surfaces as
// "Something went wrong" in our ErrorBoundary; with this listener we just reload
// against the new index.html, which references the fresh chunk paths.
//
// Sessionstorage flag prevents reload loops on real network failures.
window.addEventListener("vite:preloadError", (event) => {
  if (sessionStorage.getItem("vite-preload-reloaded") === "1") {
    // Already tried once this session — let the error surface so the user sees it.
    return;
  }
  sessionStorage.setItem("vite-preload-reloaded", "1");
  event.preventDefault();
  window.location.reload();
});

// Clear the flag once a navigation lands successfully — gives subsequent deploys
// a fresh budget of one auto-reload.
window.addEventListener("load", () => {
  sessionStorage.removeItem("vite-preload-reloaded");
});

createRoot(document.getElementById("root")!).render(<App />);
