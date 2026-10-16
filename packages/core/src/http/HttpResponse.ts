export interface HttpResponse {
  readonly statusCode: number;
  readonly sent: boolean;

  status(code: number): this;
  json(body: unknown): void;
  end(): void;
}
