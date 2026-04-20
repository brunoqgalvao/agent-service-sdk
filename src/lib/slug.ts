export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function snakeCase(value: string): string {
  return slugify(value).replace(/-/g, "_");
}
