import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import { STATUS_CODES } from "node:http";
import type { Response } from "express";
import { requestIdHeader } from "./request-log";

export class ProblemDetails {
  @ApiProperty({ example: "/problems/validation-error" })
  type!: string;
  @ApiProperty({ example: "Bad Request" })
  title!: string;
  @ApiProperty({ type: "integer", example: 400 })
  status!: number;
  @ApiProperty({ example: "VALIDATION_ERROR" })
  code!: string;
  @ApiProperty({
    example: "One or more request fields are invalid or unknown.",
  })
  detail!: string;
  @ApiProperty({ format: "uuid" })
  requestId!: string;
}

export class InvalidDtoException extends BadRequestException {}

function httpStatus(error: unknown): number {
  if (error instanceof HttpException) return error.getStatus();
  // Express body parsers can reject a request before a controller is selected.
  if (
    error instanceof Error &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    Number.isInteger(error.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  ) {
    return error.statusCode;
  }
  return 500;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) {
      res.end();
      return;
    }
    const status = httpStatus(error);
    const title = STATUS_CODES[status] ?? "Request Failed";
    const invalidDto = error instanceof InvalidDtoException;
    const code = invalidDto
      ? "VALIDATION_ERROR"
      : title.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    const detail = invalidDto
      ? "One or more request fields are invalid or unknown."
      : title;
    const problem: ProblemDetails = {
      type: "/problems/" + code.toLowerCase().replaceAll("_", "-"),
      title,
      status,
      code,
      detail,
      requestId: String(res.getHeader(requestIdHeader)),
    };
    res.status(status).type("application/problem+json").json(problem);
  }
}
