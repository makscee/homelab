import tsParser from "@typescript-eslint/parser";
import serverOnly from "eslint-plugin-server-only";

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "server-only": serverOnly },
    rules: {
      // SEC-04: Enforce that files with .server in their name import "server-only"
      // Prevents accidental omission of the server-only guard on server modules.
      // Test files are exempted — Bun's test runner neutralizes the server-only
      // sentinel via mock.module preload (see bunfig.toml + test-setup.ts), and
      // tests frequently need to import server modules directly without the
      // runtime poison from the real "server-only" package.
      "server-only/server-only": "error",
    },
  },
];

export default eslintConfig;
