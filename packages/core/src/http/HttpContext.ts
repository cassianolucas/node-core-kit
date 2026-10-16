import { Container } from "../index.js";
import { HttpRequest, HttpResponse } from "./index.js";

export interface HttpContext {
  readonly request: HttpRequest;
  readonly response: HttpResponse;
  readonly services: Container;
}
