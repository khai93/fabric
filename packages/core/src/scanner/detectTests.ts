export function isTestFile(relativePath: string): boolean {
  return /(^|\/)(__tests__|tests?|spec)\//i.test(relativePath) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(relativePath);
}
