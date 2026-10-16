import { HttpAdapter } from "./http/index.js";

export interface ApplicationOptions {
  http: HttpAdapter;
  /** Port to listen on. Use 0 to let the system choose a free port. Default: 3000. */
  port?: number;
  /** Host to bind to. Default: "127.0.0.1". Use "0.0.0.0" to accept any network interface. */
  host?: string;
  /** Maximum request body size in bytes. Default: 1 MiB. */
  bodyLimit?: number;
  /** Time allowed to receive a complete request, in milliseconds. Default: 30 seconds. */
  requestTimeoutMs?: number;
  /** Time in-flight requests get to finish on shutdown, in milliseconds. Default: 10 seconds. */
  shutdownTimeoutMs?: number;
}
