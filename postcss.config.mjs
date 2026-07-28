import path from "node:path";

const previousTailwindResolve = globalThis.__tw_resolve;

globalThis.__tw_resolve = (id, base) => {
  const cleanId = id.replaceAll("\0", "");
  const cleanBase = base.replaceAll("\0", "");
  const previousResult =
    typeof previousTailwindResolve === "function"
      ? previousTailwindResolve(cleanId, cleanBase)
      : null;

  if (previousResult) {
    return previousResult.replaceAll("\0", "");
  }

  if (cleanId === "tailwindcss") {
    return path.join(process.cwd(), "node_modules", "tailwindcss", "index.css");
  }

  if (cleanId.startsWith("tailwindcss/") && cleanId.endsWith(".css")) {
    return path.join(process.cwd(), "node_modules", cleanId);
  }

  if (cleanId.startsWith(".") && cleanId.endsWith(".css")) {
    return path.resolve(cleanBase, cleanId);
  }

  return null;
};

const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
