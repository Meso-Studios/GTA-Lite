import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

(window as unknown as { __SAN_NOVA_BOOTED?: boolean }).__SAN_NOVA_BOOTED = true;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
