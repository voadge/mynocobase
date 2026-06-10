/**
 * Minimal Node.js type declarations for compilation
 */
declare var require: ((module: string) => any) & { resolve(module: string): string; };
declare var module: { exports: any };
declare var process: {
  cwd(): string;
  env: Record<string, string | undefined>;
  [key: string]: any;
};
declare var console: {
  log(...args: any[]): void;
  error(...args: any[]): void;
  warn(...args: any[]): void;
};

declare module 'fs' {
  export function readFileSync(path: string, encoding?: string): string;
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string): string[];
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, options?: any): void;
}

declare module 'path' {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
  export function basename(path: string, ext?: string): string;
  export function dirname(path: string): string;
  export function extname(path: string): string;
  export function relative(from: string, to: string): string;
}

declare module 'http' {
  import { ClientRequest } from 'net';
  export function get(options: any, callback?: (res: any) => void): ClientRequest;
  export function request(options: any, callback?: (res: any) => void): ClientRequest;
  export interface ServerResponse { statusCode: number; }
  export interface IncomingMessage {
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    on(event: 'data', cb: (chunk: any) => void): void;
    on(event: 'end', cb: () => void): void;
    on(event: string, cb: (...args: any[]) => void): void;
    destroy(): void;
  }
}

declare module 'https' {
  export function get(url: string, callback?: (res: any) => void): any;
  export function get(options: any, callback?: (res: any) => void): any;
  export function request(options: any, callback?: (res: any) => void): any;
}

declare module 'zlib' {
  export function gunzipSync(buf: any): any;
}

declare module 'crypto' {
  export function createPrivateKey(key: string | Buffer): any;
  export function sign(algorithm: string | null, data: any, key: any): Buffer;
  export function createHash(algorithm: string): any;
  export function randomBytes(size: number): Buffer;
}

declare class URL {
  constructor(url: string, base?: string);
  hostname: string;
  pathname: string;
  search: string;
  protocol: string;
  port: string;
}
