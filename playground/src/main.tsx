import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { EdgePodProvider } from "../edgepod/client.ts";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EdgePodProvider apiKey={import.meta.env.VITE_EDGEPOD_API_KEY} url="http://localhost:8989">
      <App />
    </EdgePodProvider>
  </StrictMode>,
);
