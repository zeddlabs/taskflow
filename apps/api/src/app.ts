import { INestApplication, Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { HealthController } from "./health.controller";
import { configureOpenApi } from "./http/openapi";
import {
  InvalidDtoException,
  ProblemDetailsFilter,
} from "./http/problem-details";
import { logRequest } from "./http/request-log";

@Module({ controllers: [HealthController] })
class AppModule {}

export function configureHttp(app: INestApplication) {
  app.use(logRequest);
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
      exceptionFactory: () => new InvalidDtoException(),
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  if (process.env.NODE_ENV !== "production") configureOpenApi(app);
}

export async function createApp() {
  const app = await NestFactory.create(AppModule);
  configureHttp(app);
  return app;
}
