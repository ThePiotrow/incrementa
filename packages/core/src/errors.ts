/** A normal, transport-independent business refusal. */
export class DomainError extends Error {
  constructor(readonly code: string, message: string, readonly details: Readonly<Record<string, string>> = {}) {
    super(message);
    this.name = 'DomainError';
  }
}

/** Invalid configuration, content, or persisted state; not a business refusal. */
export class ValidationError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ValidationError';
  }
}
