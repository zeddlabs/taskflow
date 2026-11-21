"use client";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Brand } from "../../components/brand";
import { Button } from "../../components/ui/button";
import { errorMessage, login, register } from "./session";

const credentials = z.object({
  name: z.string().optional(),
  email: z.string().trim().email("Enter a valid email address.").max(320),
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(128, "Use 128 characters or fewer."),
});
const registration = credentials.extend({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(150, "Use 150 characters or fewer."),
  password: z
    .string()
    .min(15, "Use at least 15 characters.")
    .max(128, "Use 128 characters or fewer."),
});
export function AuthForm({ create = false }: { create?: boolean }) {
  const [visible, setVisible] = useState(false);
  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof credentials>>({
    resolver: zodResolver(create ? registration : credentials),
  });
  const send = handleSubmit(async ({ name, email, password }) => {
    let created = false;
    try {
      if (create) {
        await register({ name: name!, email, password });
        created = true;
      }
      await login(email, password);
      window.location.replace("/app");
    } catch (error) {
      setError("root", {
        message: created
          ? "Your account was created. Sign in to continue."
          : errorMessage(error, !create),
      });
    }
  });
  return (
    <main className="auth-page">
      <aside className="auth-art">
        <Brand />
        <div className="art-landscape" aria-hidden="true" />
      </aside>
      <section className="auth-content">
        <div className="auth-box">
          <div className="mobile-brand">
            <Brand />
          </div>
          <h1>{create ? "Create your account" : "Welcome back"}</h1>
          <p className="muted">
            {create
              ? "Enter your details to get started with TaskFlow."
              : "Sign in to your TaskFlow account."}
          </p>
          <form noValidate onSubmit={send}>
            {(create
              ? (["name", "email", "password"] as const)
              : (["email", "password"] as const)
            ).map((key) => (
              <div className="field" key={key}>
                <label htmlFor={key}>
                  {key === "name"
                    ? "Full name"
                    : key === "email"
                      ? "Email address"
                      : "Password"}
                </label>
                <div className="input-wrap">
                  <input
                    id={key}
                    {...field(key)}
                    type={
                      key === "password"
                        ? visible
                          ? "text"
                          : "password"
                        : key === "email"
                          ? "email"
                          : "text"
                    }
                    autoComplete={
                      key === "password"
                        ? create
                          ? "new-password"
                          : "current-password"
                        : key
                    }
                    aria-invalid={!!errors[key]}
                    aria-describedby={
                      errors[key]
                        ? key + "-error"
                        : create && key === "password"
                          ? "password-hint"
                          : undefined
                    }
                    required
                  />
                  {key === "password" && (
                    <button
                      className="reveal"
                      type="button"
                      aria-label={visible ? "Hide password" : "Show password"}
                      aria-pressed={visible}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  )}
                </div>
                {errors[key] ? (
                  <p id={key + "-error"} className="field-error" role="alert">
                    {errors[key]?.message}
                  </p>
                ) : (
                  create &&
                  key === "password" && (
                    <p id="password-hint" className="field-hint">
                      Use at least 15 characters.
                    </p>
                  )
                )}
              </div>
            ))}
            {errors.root && (
              <p className="notice" role="alert">
                {errors.root.message}
              </p>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Please wait…"
                : create
                  ? "Create account"
                  : "Sign in"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <p className="auth-switch">
            {create ? "Already have an account?" : "New to TaskFlow?"}{" "}
            <Link href={create ? "/login" : "/register"}>
              {create ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
