export class HttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'HttpError';
  }
}

export class AuthError extends HttpError {
  constructor(message: string, status = 401) {
    super(message, status);
    this.name = 'AuthError';
  }
}
