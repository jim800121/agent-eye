import type { IDriverPage } from '../driver/types.js';
import type { ConsoleError, NetworkError } from '../types/errors.js';

export class Collector {
  private consoleErrors: ConsoleError[] = [];
  private networkErrors: NetworkError[] = [];

  attach(page: IDriverPage): void {
    page.on('console', (...args: unknown[]) => {
      const msg = args[0] as { type(): string; text(): string; location?(): { url: string; lineNumber: number; columnNumber: number } };
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        const loc = msg.location?.();
        this.consoleErrors.push({
          level: type === 'error' ? 'error' : 'warning',
          message: msg.text(),
          source: loc
            ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}`
            : undefined,
          timestamp: new Date().toISOString(),
        });
      }
    });

    page.on('requestfailed', (...args: unknown[]) => {
      const request = args[0] as { url(): string; method(): string; failure(): { errorText: string } | null };
      this.networkErrors.push({
        url: request.url(),
        method: request.method(),
        status: 0,
        status_text: request.failure()?.errorText || 'Request failed',
        timestamp: new Date().toISOString(),
      });
    });

    page.on('response', (...args: unknown[]) => {
      const response = args[0] as { status(): number; url(): string; statusText(): string; request(): { method(): string }; text(): Promise<string> };
      if (response.status() >= 400) {
        response
          .text()
          .then((body: string) => {
            this.networkErrors.push({
              url: response.url(),
              method: response.request().method(),
              status: response.status(),
              status_text: response.statusText(),
              response_body: body.slice(0, 1000),
              timestamp: new Date().toISOString(),
            });
          })
          .catch(() => {
            this.networkErrors.push({
              url: response.url(),
              method: response.request().method(),
              status: response.status(),
              status_text: response.statusText(),
              timestamp: new Date().toISOString(),
            });
          });
      }
    });
  }

  getConsoleErrors(): ConsoleError[] {
    return [...this.consoleErrors];
  }

  getNetworkErrors(): NetworkError[] {
    return [...this.networkErrors];
  }

  reset(): void {
    this.consoleErrors = [];
    this.networkErrors = [];
  }
}
