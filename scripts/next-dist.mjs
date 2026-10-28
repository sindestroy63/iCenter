import { spawnSync } from "node:child_process";
import path from "node:path";

const [distDir, ...nextArgs] = process.argv.slice(2);
if (!/^\.next(?:-[a-z0-9-]+)?$/.test(distDir ?? "") || !["build", "start"].includes(nextArgs[0])) {
  process.stderr.write("Usage: node scripts/next-dist.mjs .next-name build|start [options]\n");
  process.exit(2);
}

const nextCli = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const env = { ...process.env, ICENTER_NEXT_DIST_DIR: distDir };

if (distDir === ".next-lowerqa") {
  const preload = path.join(process.cwd(), "scripts", "lowerqa-prisma-client.cjs");
  const preloadOption = `--require=${preload.replaceAll("\\", "/")}`;
  env.ICENTER_USE_ISOLATED_PRISMA_CLIENT = "1";
  env.NODE_OPTIONS = [env.NODE_OPTIONS, preloadOption].filter(Boolean).join(" ");
}

const result = spawnSync(process.execPath, [nextCli, ...nextArgs], {
  env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
