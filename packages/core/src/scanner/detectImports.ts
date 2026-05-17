export interface DetectedImport {
  specifier: string;
  line: number;
}

export interface DetectedExport {
  symbol: string;
  line: number;
}

export function detectImports(source: string): DetectedImport[] {
  const imports: DetectedImport[] = [];
  const lines = source.split(/\r?\n/);
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+[^'"]+\s+from\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g
  ];

  lines.forEach((lineText, index) => {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match = pattern.exec(lineText);
      while (match) {
        imports.push({ specifier: match[1], line: index + 1 });
        match = pattern.exec(lineText);
      }
    }
  });

  return imports.sort((a, b) => a.specifier.localeCompare(b.specifier) || a.line - b.line);
}

export function detectExports(source: string): DetectedExport[] {
  const exportsFound: DetectedExport[] = [];
  const lines = source.split(/\r?\n/);
  const patterns = [
    /\bexport\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z0-9_$]+)/,
    /\bexport\s+default\s+([A-Za-z0-9_$]+)?/
  ];

  lines.forEach((lineText, index) => {
    for (const pattern of patterns) {
      const match = pattern.exec(lineText);
      if (match) {
        exportsFound.push({ symbol: match[1] ?? "default", line: index + 1 });
      }
    }
  });

  return exportsFound.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.line - b.line);
}
