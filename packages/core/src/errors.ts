/** ES2018-compatible error that retains every failure from a cleanup or queue operation. */
export class DevKitAggregateError extends Error {
  override readonly name = "DevKitAggregateError";
  readonly errors: readonly unknown[];

  constructor(errors: readonly unknown[], message: string) {
    super(message);
    this.errors = Object.freeze([...errors]);
  }
}
