declare const process: {
  argv: string[];
  cwd(): string;
  exitCode?: number;
};

declare module "node:fs" {
  export function existsSync(path: string): boolean;
}

declare module "node:fs/promises" {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function stat(path: string): Promise<{ isFile(): boolean; size: number }>;
  export function unlink(path: string): Promise<void>;
  export function writeFile(path: string, data: string): Promise<void>;
  export function readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>;
  export function readdir(path: string): Promise<string[]>;

  export interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
}

declare module "node:path" {
  export function basename(path: string, suffix?: string): string;
  export function dirname(path: string): string;
  export function extname(path: string): string;
  export function join(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: string[]): string;
  export const sep: string;
  export const posix: {
    dirname(path: string): string;
    join(...paths: string[]): string;
    normalize(path: string): string;
  };
}

declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function expect(actual: unknown): {
    toEqual(expected: unknown): void;
  };
}
