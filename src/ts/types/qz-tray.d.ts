/** Tipos mínimos del paquete qz-tray (no trae los suyos): solo lo que usa la impresión de tirillas. */
declare module 'qz-tray' {
  interface QzConfig {
    readonly __brand: 'QzConfig';
  }

  interface QzRawData {
    type: 'raw';
    format: 'base64';
    data: string;
  }

  interface Qz {
    security: {
      setCertificatePromise(handler: (resolve: (certificate: string) => void) => void): void;
      setSignaturePromise(factory: (toSign: string) => (resolve: (signature: string) => void) => void): void;
    };
    websocket: {
      isActive(): boolean;
      connect(options?: { retries?: number; delay?: number }): Promise<void>;
    };
    printers: {
      find(query?: string): Promise<string[] | string>;
    };
    configs: {
      create(printer: string, options?: Record<string, unknown>): QzConfig;
    };
    print(config: QzConfig, data: QzRawData[]): Promise<void>;
  }

  const qz: Qz;
  export default qz;
}
