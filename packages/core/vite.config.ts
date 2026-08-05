import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";

export default defineConfig({
  base: "./",
  plugins: [dts({ rollupTypes: true })],
  worker: {
    format: "es",
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "@excalidraw/excalidraw",
        "mathjs",
      ],
    },
  },
});
