import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals.js";
import nextTs from "eslint-config-next/typescript.js";

// eslint-config-next versions differ: some export one config object,
// while newer versions may export an array of flat configs.
const asConfigs = (config) => Array.isArray(config) ? config : [config];

export default defineConfig([
  ...asConfigs(nextVitals),
  ...asConfigs(nextTs),
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"])
]);
