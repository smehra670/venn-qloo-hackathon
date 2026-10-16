import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
// Set MapLibre worker URL before any Map is constructed
import "@/lib/maplibre";
import { App } from "./App";
import "./index.css";
import "./overview.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
