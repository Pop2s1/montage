import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@montage.app";
  const passwordHash = await hash("demo12345", 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Démo Montage",
      passwordHash,
      plan: "free",
      accounts: { create: {} },
    },
  });

  const existing = await prisma.project.findFirst({
    where: { userId: user.id, name: "Événement démo" },
  });

  if (!existing) {
    await prisma.project.create({
      data: {
        userId: user.id,
        name: "Événement démo",
        format: "instagram_reel",
        targetDurationSec: 45,
        tone: "dynamique",
        prompt:
          "Crée un Reel Instagram dynamique de 45 secondes sur notre événement. Utilise les meilleurs moments, supprime les silences, ajoute des sous-titres modernes, une accroche forte au début et un appel à l'action à la fin.",
        status: "draft",
        customWidth: 1080,
        customHeight: 1920,
        settings: { create: {} },
      },
    });
  }

  console.log("Seed OK");
  console.log(`  email: ${email}`);
  console.log("  password: demo12345");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
