import nextConfig from "eslint-config-next";

/**
 * ESLint (flat config). `next lint` was removed in Next 16; `npm run lint`
 * runs eslint directly. Architecture boundaries from
 * docs/backend/19-implementation-conventions.md §1 are enforced here:
 *   - only src/server/lib/db.ts instantiates PrismaClient
 *   - route handlers never import repositories
 * and one security rule: raw JSON.stringify output never goes into
 * dangerouslySetInnerHTML (JSON escaping leaves </script> intact; use
 * serializeJsonLd from src/lib/json-ld.ts).
 */
export default [
  ...nextConfig,
  {
    ignores: [".next/**", ".netlify/**", "node_modules/**", "out/**", "prisma/migrations/**"],
  },
  {
    // React Compiler lint rules: the localStorage-hydration pattern (setState
    // inside a mount effect) and clock reads during render for countdown /
    // relative-time UI are deliberate here. Surface as warnings, do not block.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
  {
    // Inline HTML/script bodies come only from reviewed producers: structured
    // data through serializeJsonLd, and the two fixed bootstrap scripts. Any
    // other value (a variable, a template literal, raw JSON.stringify) is an
    // error, wherever the __html object is built.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Property[key.name='__html'] > .value:not(CallExpression[callee.name=/^(serializeJsonLd|googleTagBootstrap)$/]):not(Identifier[name='CURRENCY_BOOTSTRAP_SCRIPT'])",
          message: "Inline HTML must come from serializeJsonLd() (@/lib/json-ld) or a reviewed fixed script. JSON.stringify does not escape </script>.",
        },
      ],
    },
  },
  {
    files: ["src/app/api/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/repositories/*", "**/repositories/*"],
              message: "Route handlers call services, not repositories (§19 §1).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/services/**/*.ts", "src/server/domain/**/*.ts", "src/app/**/*.{ts,tsx}"],
    ignores: ["src/server/lib/db.ts", "**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              importNames: ["PrismaClient"],
              message: "Only src/server/lib/db.ts instantiates Prisma (§19 §1).",
            },
          ],
        },
      ],
    },
  },
];
