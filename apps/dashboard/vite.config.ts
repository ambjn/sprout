import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the bundle works wherever `sprout dash` serves it from.
  base: "./",
});
