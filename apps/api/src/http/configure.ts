import { INestApplication, ValidationPipe } from "@nestjs/common";
import { configureOpenApi } from "./openapi";
import { InvalidDtoException, ProblemDetailsFilter } from "./problem-details";
import { logRequest } from "./request-log";

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
