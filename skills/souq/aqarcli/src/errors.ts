export class AqarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AqarError";
  }
}
