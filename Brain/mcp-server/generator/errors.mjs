export class GenerateError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "GenerateError";
    this.ok = false;
    this.code = code;
    this.detail = detail;
  }

  toResult() {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      detail: this.detail,
    };
  }
}

export function fail(code, message, detail) {
  throw new GenerateError(code, message, detail);
}
