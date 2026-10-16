import type { HttpContext } from "./HttpContext.js";
import type { HttpResponse } from "./HttpResponse.js";
import {
  buildProblemDetails,
  PROBLEM_CONTENT_TYPE,
  ProblemOptions,
} from "../ProblemDetails.js";

const HTTP_RESULT = Symbol("nodecore.http-result");

export interface HttpResult {
  readonly [HTTP_RESULT]: true;
  apply(response: HttpResponse, context?: HttpContext): void;
}

class Result implements HttpResult {
  readonly [HTTP_RESULT] = true as const;

  constructor(
    private readonly statusCode: number,
    private readonly body?: unknown,
    private readonly headers: Readonly<Record<string, string>> = {},
    private readonly hasBody = true,
  ) {}

  apply(response: HttpResponse): void {
    response.status(this.statusCode);
    for (const [name, value] of Object.entries(this.headers))
      response.header(name, value);
    if (!this.hasBody) response.end();
    else response.json(this.body);
  }
}

export function isHttpResult(value: unknown): value is HttpResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Partial<HttpResult>)[HTTP_RESULT] === true
  );
}

class ProblemResult implements HttpResult {
  readonly [HTTP_RESULT] = true as const;

  constructor(
    private readonly statusCode: number,
    private readonly options: ProblemOptions,
  ) {}

  apply(response: HttpResponse, context?: HttpContext): void {
    const problem = buildProblemDetails(
      this.statusCode,
      this.options,
      context?.request.path,
    );

    response
      .status(this.statusCode)
      .header("content-type", PROBLEM_CONTENT_TYPE)
      .json(problem);
  }
}

/**
 * Error results use a Problem Details body unless the caller passes its own.
 */
function problemResult(statusCode: number, body?: unknown): HttpResult {
  if (body !== undefined) {
    return new Result(statusCode, body);
  }

  return new ProblemResult(statusCode, {});
}

export const Results = {
  problemDetails(statusCode: number, options: ProblemOptions = {}): HttpResult {
    return new ProblemResult(statusCode, options);
  },
  ok<T>(body: T): HttpResult {
    return new Result(200, body);
  },
  created<T>(location: string, body?: T): HttpResult {
    return new Result(201, body, { location }, body !== undefined);
  },
  noContent(): HttpResult {
    return new Result(204, undefined, {}, false);
  },
  json<T>(
    body: T,
    statusCode = 200,
    headers: Readonly<Record<string, string>> = {},
  ): HttpResult {
    return new Result(statusCode, body, headers);
  },
  badRequest<T>(body?: T): HttpResult {
    return problemResult(400, body);
  },
  unauthorized<T>(body?: T): HttpResult {
    return problemResult(401, body);
  },
  forbidden<T>(body?: T): HttpResult {
    return problemResult(403, body);
  },
  notFound<T>(body?: T): HttpResult {
    return problemResult(404, body);
  },
  conflict<T>(body?: T): HttpResult {
    return problemResult(409, body);
  },
  status<T>(statusCode: number, body?: T): HttpResult {
    return new Result(statusCode, body, {}, body !== undefined);
  },
};
