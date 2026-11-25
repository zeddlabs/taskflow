import { Injectable } from "@nestjs/common";
import { SmtpMailer } from "./smtp-mailer";

@Injectable()
export class VerificationMailer {
  constructor(private readonly mailer: SmtpMailer) {}
  async send(email: string, code: string) {
    await this.mailer.send(
      email,
      "Verify your TaskFlow email",
      "Your TaskFlow verification code is " +
        code +
        ".\n\nEnter it in Account within 15 minutes. If you did not request a code, you can ignore this email.",
    );
  }
}
