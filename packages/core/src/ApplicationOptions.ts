import { HttpAdapter } from "./http/index.js";

export interface ApplicationOptions {
  http: HttpAdapter;
  port?: number;
}
