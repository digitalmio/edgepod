import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { edgepod } from "@edgepod/client/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), edgepod()],
});
