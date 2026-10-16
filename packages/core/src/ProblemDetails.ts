/**
 * Error response body following RFC 7807 (Problem Details for HTTP APIs).
 * Extension members, such as `code`, are allowed.
 */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly code?: string;
  readonly [extension: string]: unknown;
}

export interface ProblemOptions {
  readonly type?: string;
  readonly title?: string;
  readonly detail?: string;
  readonly code?: string;
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

const TITLES: Readonly<Record<number, string>> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Content",
  500: "Internal Server Error",
};

export function problemTitle(status: number): string {
  return TITLES[status] ?? "Error";
}

export function buildProblemDetails(
  status: number,
  options: ProblemOptions,
  instance?: string,
): ProblemDetails {
  return {
    ...(options.extensions ?? {}),
    type: options.type ?? "about:blank",
    title: options.title ?? problemTitle(status),
    status,
    ...(options.detail === undefined ? {} : { detail: options.detail }),
    ...(instance === undefined ? {} : { instance }),
    ...(options.code === undefined ? {} : { code: options.code }),
  };
}
