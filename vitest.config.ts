import path from "node:path";
import { defineConfig } from "vitest/config";

const shared = path.resolve(import.meta.dirname, "shared");
const src = path.resolve(import.meta.dirname, "src");

export default defineConfig({
  resolve: {
    alias: {
      "@shared": shared,
      "@": src,
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "shared/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    alias: {
      "@shared": shared,
      "@": src,
    },
  },
});
