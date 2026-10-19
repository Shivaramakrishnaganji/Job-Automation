declare module 'pg' {
  export class Pool {
    constructor(config?: any);
    connect(): Promise<any>;
    query(text: string, values?: any[]): Promise<any>;
    end(): Promise<void>;
  }
}

declare module 'pg-connection-string' {
  export function parse(connectionString: string): Record<string, any>;
}
