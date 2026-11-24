import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, getSchemaPath, SwaggerModule } from "@nestjs/swagger";
import { ProblemDetails } from "./problem-details";
import { requestIdHeader } from "./request-log";

export const requestIdResponseHeaders = {
  [requestIdHeader]: {
    description: "Server-generated request identifier",
    schema: { type: "string", format: "uuid" },
  },
};

export function problemResponse(description: string) {
  return {
    description,
    headers: requestIdResponseHeaders,
    content: {
      "application/problem+json": {
        schema: { $ref: getSchemaPath(ProblemDetails) },
      },
    },
  };
}

export function configureOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("TaskFlow API")
    .setVersion("1")
    .addCookieAuth("access_token")
    .addCookieAuth("refresh_token", { type: "apiKey" }, "refresh")
    .addCookieAuth("logout_session", { type: "apiKey" }, "logout")
    .addGlobalResponse({
      status: "default",
      ...problemResponse(
        "Request failed. Use the request ID to correlate the response with the server log.",
      ),
    })
    .build();
  const document = () =>
    SwaggerModule.createDocument(app, config, {
      extraModels: [ProblemDetails],
    });
  SwaggerModule.setup("api/v1/docs", app, document, {
    jsonDocumentUrl: "api/v1/openapi.json",
    raw: ["json"],
  });
}
