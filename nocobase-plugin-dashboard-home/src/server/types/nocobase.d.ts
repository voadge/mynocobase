/**
 * Type declarations for @nocobase/server peer dependency
 * Used at runtime inside Docker container; types are minimal for compilation only
 */
declare module '@nocobase/server' {
  import http from 'http';

  export class Plugin {
    app: any;
    db: any;
    load(): Promise<void>;
    afterLoad(): Promise<void>;
    getName(): string;
  }

  export interface Context {
    path: string;
    method: string;
    query: Record<string, string>;
    request: {
      body?: any;
    };
    state: {
      currentUser?: any;
      reqPath?: string;
      [key: string]: any;
    };
    cookies: {
      get(name: string): string | undefined;
    };
    get(name: string): string | undefined;
    set(name: string, value: string): void;
    redirect(url: string): void;
    status: number;
    body: any;
    type: string;
    withoutDataWrapping: boolean;
    db: any;
    [key: string]: any;
  }

  export interface NextFunction {
    (): Promise<void>;
  }
}
