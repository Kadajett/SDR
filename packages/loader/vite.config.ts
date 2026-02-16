import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    port: 3001,
    proxy: {
      "/api": "http://localhost:2567",
      "/games": "http://localhost:2567",
    },
  },
  build: {
    target: "esnext",
  },
});
