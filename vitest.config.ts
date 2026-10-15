import path from "node:path";
import { defineConfig } from "vitest/config";

const shared = path.resolve(import.meta.dirname, "shared");

export default defineConfig({
  resolve: {
    alias: {
      "@shared": shared,
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "shared/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    alias: {
      "@shared": shared,
    },
  },
});
