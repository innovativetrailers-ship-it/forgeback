import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const CODE_NET_FILES = [
  "src/lib/diagnostics/boundary.ts",
  "src/lib/diagnostics/captureCode.ts",
  "src/lib/diagnostics/codeGuards.ts",
  "src/components/diagnostics/CodeErrorBridge.tsx",
  "src/app/api/dev/code/route.ts",
  "src/__tests__/code-net.test.ts",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: CODE_NET_FILES,
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint-code-net.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    rules: {
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
