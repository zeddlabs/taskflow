import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { configureHttp } from "./http/configure";

@Module({ imports: [AuthModule], controllers: [HealthController] })
class AppModule {}

export async function createApp() {
  const app = await NestFactory.create(AppModule);
  configureHttp(app);
  return app;
}
