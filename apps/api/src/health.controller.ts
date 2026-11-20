import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiProperty, ApiTags } from "@nestjs/swagger";
import { requestIdResponseHeaders } from "./http/openapi";

class LivenessDto {
  @ApiProperty({ type: String, enum: ["ok"] })
  status!: "ok";
}

@Controller("health")
@ApiTags("Health")
export class HealthController {
  @Get("live")
  @ApiOkResponse({
    type: LivenessDto,
    headers: requestIdResponseHeaders,
    description: "API process is live.",
  })
  live(): LivenessDto {
    return { status: "ok" };
  }
}
