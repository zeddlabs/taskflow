import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { HealthController } from "./health.controller";

@Module({ controllers: [HealthController] })
class AppModule {}

export async function createApp() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  return app;
}
