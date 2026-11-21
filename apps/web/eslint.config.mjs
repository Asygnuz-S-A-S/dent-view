import next from "eslint-config-next";

export default [
  ...next,
  { ignores: [".next/**", "next-env.d.ts"] },
  {
    // En archivos "use server" Next solo acepta funciones async exportadas: un `export const` rompe `next build`.
    files: ["src/**/*actions.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "ExportNamedDeclaration > VariableDeclaration", message: "Server Actions: usa `export async function`." },
      ],
    },
  },
];
