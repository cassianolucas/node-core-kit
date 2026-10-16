import { HttpMethod } from "./index.js";

export interface HttpRequest {
  readonly method: HttpMethod;
  readonly path: string;
  readonly params: Record<string, string>;
  readonly query: Record<string, unknown>;
  readonly headers: Record<string, unknown>;
  readonly body: unknown;
}
