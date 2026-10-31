import { defineConfig } from "vite"; import react from "@vitejs/plugin-react"; import path from "path";
const here = path.resolve("zt");
export default defineConfig({ root: here, base: "./", plugins: [react(), { name: "mock", enforce: "pre", resolveId(src, imp) { if (src.endsWith("lib/api.js") && imp && imp.includes("ChatAssistant")) return path.join(here, "mockapi.js"); } }],
  build: { outDir: path.join(here, "dist"), emptyOutDir: true }, logLevel: "warn" });
