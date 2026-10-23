import path from "node:path";
import { defineConfig } from "tsup";

const root = import.meta.dirname;

export default defineConfig({
  entry: ["server/index.ts"],
  outDir: "dist/server",
  format: ["esm"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: false,
  tsconfig: "tsconfig.server.json",
  // Swipe-card data files are read at runtime from next to the bundle (server/anchors/cardData.ts).
  onSuccess: async () => {
    const { copyFileSync, existsSync } = await import("node:fs");
    for (const name of ["blocklist.txt", "seed-ids.json", "cards-snapshot.json"]) {
      const from = path.resolve(root, "server/anchors", name);
      if (existsSync(from)) copyFileSync(from, path.resolve(root, "dist/server", name));
    }
  },
  esbuildPlugins: [
    {
      name: "shared-alias",
      setup(build) {
        build.onResolve({ filter: /^@shared\// }, (args) => {
          const name = args.path.slice("@shared/".length);
          return { path: path.resolve(root, "shared", `${name}.ts`) };
        });
      },
    },
  ],
});
