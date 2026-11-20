import {
  Body,
  Controller,
  Get,
  INestApplication,
  Module,
  Post,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { IsString } from "class-validator";
import request from "supertest";
import { configureHttp } from "../src/http/configure";
import { HealthController } from "../src/health.controller";

class ProbeDto {
  @IsString()
  value!: string;
}

const sensitive = "synthetic-private-marker";

@Controller("probe")
class ProbeController {
  @Post()
  validate(@Body() dto: ProbeDto) {
    return { transformed: dto instanceof ProbeDto };
  }

  @Get(":id")
  fail() {
    throw new Error(sensitive);
  }
}

@Module({ controllers: [HealthController, ProbeController] })
class ProbeModule {}

describe("HTTP contract", () => {
  let app: INestApplication;
  const stdout: string[] = [];
  const stderr: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(ProbeModule);
    configureHttp(app);
    await app.init();
  });

  beforeEach(() => {
    stdout.length = stderr.length = 0;
    jest.spyOn(process.stdout, "write").mockImplementation((line) => {
      stdout.push(String(line));
      return true;
    });
    jest.spyOn(process.stderr, "write").mockImplementation((line) => {
      stderr.push(String(line));
      return true;
    });
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => app.close());

  function verifyRequest(response: request.Response) {
    const requestId = response.headers["x-request-id"];
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(stdout).toHaveLength(1);
    const log = JSON.parse(stdout[0]);
    expect(log).toEqual({
      requestId,
      method: expect.any(String),
      route: log.route === null ? null : expect.any(String),
      status: response.status,
      durationMs: expect.any(Number),
    });
    expect(stdout.join("") + stderr.join("")).not.toContain(sensitive);
    expect(stderr).toEqual([]);
    return log;
  }

  function verifyProblem(response: request.Response, code: string) {
    verifyRequest(response);
    expect(response.headers["content-type"]).toMatch(
      /^application\/problem\+json/,
    );
    expect(response.body).toEqual({
      type: "/problems/" + code.toLowerCase().replaceAll("_", "-"),
      title: expect.any(String),
      status: response.status,
      code,
      detail: expect.any(String),
      requestId: response.headers["x-request-id"],
    });
    expect(response.text).not.toContain(sensitive);
  }

  it("transforms a valid DTO and issues a server-generated correlation ID", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/probe")
      .set("X-Request-Id", sensitive)
      .send({ value: sensitive })
      .expect(201);
    expect(response.body).toEqual({ transformed: true });
    expect(verifyRequest(response).route).toBe("/api/v1/probe");
  });

  it.each([{ value: sensitive, [sensitive]: "unknown field" }, { value: 42 }])(
    "rejects an invalid DTO",
    async (body) => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/probe")
        .send(body)
        .expect(400);
      verifyProblem(response, "VALIDATION_ERROR");
    },
  );

  it("correlates and sanitizes malformed JSON before routing", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/probe")
      .type("json")
      .send('{"' + sensitive + '":')
      .expect(400);
    verifyProblem(response, "BAD_REQUEST");
  });

  it("preserves the body parser's size limit and problem envelope", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/probe")
      .send({ value: sensitive.repeat(8192) })
      .expect(413);
    verifyProblem(response, "PAYLOAD_TOO_LARGE");
  });

  it("omits unknown paths and query strings from 404 responses and logs", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/" + sensitive)
      .query({ q: sensitive })
      .expect(404);
    verifyProblem(response, "NOT_FOUND");
  });

  it("logs the route template and suppresses unexpected exception details", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/probe/" + sensitive)
      .query({ token: sensitive })
      .set("Cookie", "session=" + sensitive)
      .set("Authorization", "Bearer " + sensitive)
      .expect(500);
    verifyProblem(response, "INTERNAL_SERVER_ERROR");
    expect(JSON.parse(stdout[0]).route).toBe("/api/v1/probe/:id");
    expect(response.body.detail).toBe("Internal Server Error");
  });

  it("publishes versioned paths, success data and the shared problem schema", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/openapi.json")
      .expect(200);
    const { paths, components } = response.body;
    const responses = paths["/api/v1/health/live"].get.responses;
    expect(responses["200"].content["application/json"].schema.$ref).toBe(
      "#/components/schemas/LivenessDto",
    );
    expect(components.schemas.LivenessDto.properties.status.enum).toEqual([
      "ok",
    ]);
    expect(responses["200"].headers["X-Request-Id"].schema.format).toBe("uuid");
    expect(
      responses.default.content["application/problem+json"].schema.$ref,
    ).toBe("#/components/schemas/ProblemDetails");
    expect(components.schemas.ProblemDetails.required.sort()).toEqual([
      "code",
      "detail",
      "requestId",
      "status",
      "title",
      "type",
    ]);
    expect(components.schemas.ProblemDetails.properties.status.type).toBe(
      "integer",
    );
  });
});
