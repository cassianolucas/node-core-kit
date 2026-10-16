/**
 * Matches a request path against a route template such as "/users/:id".
 * Returns the captured parameters, or undefined when the path does not match.
 */
export function matchRoute(
  template: string,
  path: string,
): Record<string, string> | undefined {
  const templateSegments = splitPath(template);
  const pathSegments = splitPath(path);

  if (templateSegments.length !== pathSegments.length) {
    return undefined;
  }

  const params: Record<string, string> = {};

  for (const [index, segment] of templateSegments.entries()) {
    const value = pathSegments[index] ?? "";

    if (segment.startsWith(":")) {
      params[segment.slice(1)] = decodeSegment(value);
    } else if (segment !== value) {
      return undefined;
    }
  }

  return params;
}

function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Finds the first route for a method and path. Adapters use it to dispatch requests. */
export function findRoute<R extends { method: string; path: string }>(
  routes: readonly R[],
  method: string,
  pathname: string,
): { route: R; params: Record<string, string> } | undefined {
  for (const route of routes) {
    if (route.method !== method) {
      continue;
    }

    const params = matchRoute(route.path, pathname);

    if (params) {
      return { route, params };
    }
  }

  return undefined;
}
