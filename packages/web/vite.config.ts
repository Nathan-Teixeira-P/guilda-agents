import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// dev: proxy API and SSE to the hub server (npm start, port 4317)
const hub = "http://127.0.0.1:4317";
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/missions": hub, "/projects": hub, "/events": hub, "/usage": hub, "/redacao": hub, "/afiliados": hub } },
  build: { outDir: "dist", emptyOutDir: true },
});
