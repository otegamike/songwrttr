import { toApiError } from "./errors";

export interface RouteContext<P extends Record<string, string>> {
  params: Promise<P>;
}

export type RouteHandler<P extends Record<string, string>> = (
  request: Request,
  context: RouteContext<P>,
) => Promise<Response>;

export function apiHandler<P extends Record<string, string> = Record<string, string>>(
  handler: RouteHandler<P>,
): RouteHandler<P> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      const apiError = toApiError(error);
      const path = new URL(request.url).pathname;

      console.error(
        `[api] ${request.method} ${path} -> ${apiError.code} (${apiError.status})`,
        {
          code: apiError.code,
          message: apiError.message,
        },
      );

      return Response.json(
        { error: { code: apiError.code, message: apiError.message } },
        { status: apiError.status, headers: apiError.headers },
      );
    }
  };
}
