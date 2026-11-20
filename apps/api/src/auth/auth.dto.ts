import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsString, Length, MaxLength } from "class-validator";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

class EmailDto {
  @ApiProperty({ format: "email", maxLength: 320 })
  @Transform(({ value }) =>
    typeof value === "string" ? normalizeEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class RegisterDto extends EmailDto {
  @ApiProperty({ minLength: 1, maxLength: 150 })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(1, 150)
  name!: string;

  @ApiProperty({
    writeOnly: true,
    format: "password",
    minLength: 15,
    maxLength: 128,
  })
  @IsString()
  @Length(15, 128)
  password!: string;
}

export class LoginDto extends EmailDto {
  @ApiProperty({
    writeOnly: true,
    format: "password",
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @Length(1, 128)
  password!: string;
}

export class ProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: "email" }) email!: string;
  @ApiProperty() name!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null;
}
