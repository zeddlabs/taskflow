import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createTransport } from "nodemailer";

@Injectable()
export class VerificationMailer {
  async send(email: string, code: string) {
    const {
      SMTP_HOST: host,
      SMTP_USER: user,
      SMTP_PASSWORD: pass,
      SMTP_FROM: from,
    } = process.env;
    const port = Number(process.env.SMTP_PORT ?? 587);
    if (!host || !from || Boolean(user) !== Boolean(pass))
      throw new ServiceUnavailableException();
    const transport = createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: process.env.NODE_ENV === "production" && port !== 465,
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    await transport.sendMail({
      from,
      to: { name: "", address: email },
      subject: "Verify your TaskFlow email",
      text:
        "Your TaskFlow verification code is " +
        code +
        ".\n\nEnter it in Account within 15 minutes. If you did not request a code, you can ignore this email.",
    });
  }
}
