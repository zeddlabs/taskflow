import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "src/generated/prisma/**"] },
  ...tseslint.configs.recommended,
);
