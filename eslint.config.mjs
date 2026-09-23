import nextConfig from "eslint-config-next";

/**
 * ESLint (flat config). `next lint` was removed in Next 16; `npm run lint`
 * runs eslint directly. Architecture boundaries from
 * docs/backend/19-implementation-conventions.md §1 are enforced here:
 *   - only src/server/lib/db.ts instantiates PrismaClient
 *   - route handlers never import repositories
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
