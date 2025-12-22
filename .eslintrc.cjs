/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  ignorePatterns: [
    "**/dist/**",
    "**/.next/**",
    "**/node_modules/**",
    "**/coverage/**",
    "**/build/**",
  ],
  env: {
    es2022: true,
  },
  overrides: [
    // Node/Express (TypeScript)
    {
      files: ["apps/*/src/**/*.ts", "apps/*/tests/**/*.ts"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      plugins: ["@typescript-eslint"],
      extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
      rules: {
        "@typescript-eslint/no-unused-vars": [
          "warn",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/ban-types": "off",
      },
    },
    // Next.js app
    {
      files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
      extends: ["next/core-web-vitals"],
    },
  ],
};

