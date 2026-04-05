/**
 * Shared utilities for scripts that generate content files.
 */

/**
 * Convert a title into a URL-friendly slug, truncated at a word boundary.
 */
export function slugify(title: string, maxLength = 60): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= maxLength) return slug;
  const truncated = slug.substring(0, maxLength);
  const lastHyphen = truncated.lastIndexOf('-');
  return lastHyphen > 0 ? truncated.substring(0, lastHyphen) : truncated;
}

/**
 * Escape a string for use in a TOML double-quoted value.
 */
export function escapeToml(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
