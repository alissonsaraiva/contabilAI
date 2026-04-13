import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Regras adicionais do projeto
  {
    rules: {
      // Proíbe catch vazio — todo erro deve ser logado ou ter disable-line com justificativa
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },
  // Regras com type-checking (requerem projeto TypeScript)
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // Proíbe promises não tratadas — causa raiz do padrão "refresh só no try sem finally"
      "@typescript-eslint/no-floating-promises": "error",
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
