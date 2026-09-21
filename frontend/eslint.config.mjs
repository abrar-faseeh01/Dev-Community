import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Data flow: page -> feature component -> query/mutation -> services/api ->
  // lib/axios. Pages and components never talk to the API themselves; they go
  // through a query/mutation hook (features/<x>/queries|mutations).
  {
    files: [
      "src/app/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
      "src/features/*/components/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "axios",
              message:
                "Components and pages must not call the API directly. Use a query/mutation hook from features/<name>/queries or /mutations.",
            },
          ],
          patterns: [
            {
              group: [
                "@/lib/axios/client",
                "@/lib/axios/interceptors",
                "@/services/**",
              ],
              message:
                "Components and pages must not call the API directly. Use a query/mutation hook from features/<name>/queries or /mutations.",
            },
          ],
        },
      ],
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
