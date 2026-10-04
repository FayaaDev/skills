export class HarajError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarajError";
  }
}
