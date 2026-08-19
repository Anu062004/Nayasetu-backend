export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function requireFound<T>(value: T | undefined | null, entity: string): T {
  if (value === undefined || value === null) {
    throw new AppError(404, "NOT_FOUND", `${entity} was not found`);
  }
  return value;
}
