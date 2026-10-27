/** Resolve deployment URLs at the DOM boundary; saved designs keep canonical /assets paths. */
export function createSiteUrls(basePath: string) {
  if (
    !basePath.startsWith("/") ||
    basePath.startsWith("//") ||
    /[?#\\]/.test(basePath) ||
    basePath.split("/").includes("..")
  ) {
    throw new Error("The application base must be an absolute URL pathname.");
  }
  const segment = basePath.replace(/^\/+|\/+$/g, "");
  const base = segment ? `/${segment}/` : "/";
  const prefix = base.slice(0, -1);
  function appUrl(path: string): string {
    if (!path.startsWith("/") || path.startsWith("//")) return path;
    if (path === prefix) return base;
    if (path.startsWith(base)) return path;
    return prefix + path;
  }
  function assetUrl(source: string): string {
    return source.startsWith("/assets/") ? appUrl(source) : source;
  }
  function getAppPathname(pathname: string): string {
    if (pathname === prefix) return "/";
    return pathname.startsWith(base)
      ? "/" + pathname.slice(base.length)
      : pathname;
  }
  return { appUrl, assetUrl, getAppPathname };
}

export const { appUrl, assetUrl, getAppPathname } = createSiteUrls(
  import.meta.env?.BASE_URL ?? "/",
);
