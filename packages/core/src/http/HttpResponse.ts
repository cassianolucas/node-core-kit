export interface HttpResponse {
  readonly statusCode: number;
  readonly sent: boolean;

  status(code: number): this;
  header(name: string, value: string): this;
  json(body: unknown): void;
  end(): void;
}
