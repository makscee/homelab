import tsParser from "@typescript-eslint/parser";
import serverOnly from "eslint-plugin-server-only";

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "server-only": serverOnly },
    rules: {
      // SEC-04: Enforce that files with .server in their name import "server-only"
      // Prevents accidental omission of the server-only guard on server modules
      "server-only/server-only": "error",
    },
  },
];

export default eslintConfig;
