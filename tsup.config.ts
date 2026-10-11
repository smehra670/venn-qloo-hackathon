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
