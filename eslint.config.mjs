// eslint.config.mjs
import eslintPluginPrettier from "eslint-plugin-prettier";
import eslintPluginTypeScript from "@typescript-eslint/eslint-plugin";
import eslintParserTypeScript from "@typescript-eslint/parser";

export default [
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        // Directly define any necessary globals instead of using `env`
        process: "readonly",
        __dirname: "readonly",
        module: "readonly",
        exports: "readonly",
        require: "readonly",
      },
      parser: eslintParserTypeScript,
    },
    plugins: {
      "@typescript-eslint": eslintPluginTypeScript,
      prettier: eslintPluginPrettier,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
    ignores: [".pnp.*"],
    settings: {},
  },
];
