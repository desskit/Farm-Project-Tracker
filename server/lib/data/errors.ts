/** Thrown by the data-access layer for validation/business-rule failures. */
export class DataError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
