import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { connectDatabase } from "./database";

async function seed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development seed requires a nonproduction environment.");
  }
  const db = connectDatabase();
  try {
    const passwordHash = await hash(randomBytes(32), {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await db.$transaction(async (tx) => {
      const owner = await tx.user.upsert({
        where: { id: "cm00000000000000000000001" },
        update: {},
        create: {
          id: "cm00000000000000000000001",
          emailNormalized: "owner@example.invalid",
          name: "Demo Owner",
          emailVerifiedAt: new Date(),
          passwordHash,
        },
      });
      for (const [id, slug, name] of [
        ["cm00000000000000000000002", "acme-studio", "Acme Studio"],
        ["cm00000000000000000000003", "northwind-labs", "Northwind Labs"],
      ]) {
        const workspace = await tx.workspace.upsert({
          where: { id },
          update: {},
          create: { id, slug, name },
        });
        const membership = { workspaceId: workspace.id, userId: owner.id };
        await tx.workspaceMember.upsert({
          where: { workspaceId_userId: membership },
          update: {},
          create: { ...membership, role: "OWNER" },
        });
      }
    });
  } finally {
    await db.$disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
