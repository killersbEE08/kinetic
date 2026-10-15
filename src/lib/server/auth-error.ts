// Error with an HTTP status and a safe, user-facing message. Kept in its own module so
// auth, limits and storage can share it without import cycles.
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}
