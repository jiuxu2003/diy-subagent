import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Bundled data-monospace font; Vite inlines the woff2 so no runtime network.
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

import { App } from "./app/App";
import { AppProviders } from "./app/providers/AppProviders";
import "./styles/globals.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
