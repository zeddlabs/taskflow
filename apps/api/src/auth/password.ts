import { Algorithm, hash } from "@node-rs/argon2";

export function hashPassword(password: string | Buffer) {
  return hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}
