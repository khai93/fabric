export interface DetectedRoute {
  idHint: string;
  method?: string;
  path: string;
  line: number;
  source: "app" | "router";
}

const routeMethods = "get|post|put|patch|delete|head|options|all";

export function detectRoutes(source: string): DetectedRoute[] {
  const routes: DetectedRoute[] = [];
  const lines = source.split(/\r?\n/);
  const directPattern = new RegExp(`\\b(app|router)\\.(${routeMethods})\\(\\s*["'\`]([^"'\`]+)["'\`]`, "i");
  const usePattern = /\bapp\.use\(\s*["'`]([^"'`]+)["'`]/i;

  lines.forEach((lineText, index) => {
    const direct = directPattern.exec(lineText);
    if (direct) {
      const method = direct[2].toLowerCase();
      const path = direct[3];
      routes.push({
        idHint: routeIdFromPath(method, path),
        method,
        path,
        line: index + 1,
        source: direct[1].toLowerCase() === "app" ? "app" : "router"
      });
      return;
    }

    const mounted = usePattern.exec(lineText);
    if (mounted) {
      const path = mounted[1];
      routes.push({
        idHint: routeIdFromPath(undefined, path),
        path,
        line: index + 1,
        source: "app"
      });
    }
  });

  return routes.sort((a, b) => a.idHint.localeCompare(b.idHint) || a.line - b.line);
}

function routeIdFromPath(method: string | undefined, path: string): string {
  const slug = path
    .replace(/[:*]/g, "")
    .split("/")
    .filter(Boolean)
    .join(".")
    .replace(/[^a-zA-Z0-9.]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase();

  if (method) {
    return `route.${method}.${slug || "root"}`;
  }

  return `route.${slug || "root"}`;
}
