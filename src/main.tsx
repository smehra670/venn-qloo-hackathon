import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { App } from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
