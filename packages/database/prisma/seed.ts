import 'dotenv/config';
import {
  ConnectorAuthenticationStatus,
  ConnectorExecutionLocation,
  PrismaClient,
  Role,
  UserStatus,
} from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const connectorSeeds = [
  ['dealership-website', 'Dealership Website', ConnectorExecutionLocation.RAILWAY, true],
  ['facebook-marketplace', 'Facebook Marketplace', ConnectorExecutionLocation.LOCAL_AGENT, true],
  ['drivecentric', 'DriveCentric', ConnectorExecutionLocation.EXTENSION, true],
  ['routeone-bank-brain', 'RouteOne / Bank Brain', ConnectorExecutionLocation.RAILWAY, true],
  ['vauto', 'vAuto', ConnectorExecutionLocation.LOCAL_AGENT, false],
  ['reconvision', 'ReconVision', ConnectorExecutionLocation.LOCAL_AGENT, false],
  ['onemicro', '1Micro', ConnectorExecutionLocation.LOCAL_AGENT, false],
  ['carfax', 'CARFAX', ConnectorExecutionLocation.LOCAL_AGENT, false],
  ['window-sticker', 'Window Sticker', ConnectorExecutionLocation.RAILWAY, false],
  ['accutrade', 'AccuTrade', ConnectorExecutionLocation.LOCAL_AGENT, false],
  ['reynolds', 'Reynolds & Reynolds', ConnectorExecutionLocation.LOCAL_AGENT, false],
  ['craigslist', 'Craigslist', ConnectorExecutionLocation.LOCAL_AGENT, false],
  ['offerup', 'OfferUp', ConnectorExecutionLocation.LOCAL_AGENT, false],
] as const;

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function main() {
  for (const [id, displayName, executionLocation, enabled] of connectorSeeds) {
    await prisma.connector.upsert({
      where: { id },
      create: {
        id,
        displayName,
        executionLocation,
        enabled,
        capabilities: ['read'],
        authenticationStatus: enabled
          ? ConnectorAuthenticationStatus.AUTHENTICATED
          : ConnectorAuthenticationStatus.NOT_CONFIGURED,
      },
      update: { displayName, executionLocation },
    });
  }

  const dealershipName = (process.env.SEED_DEALERSHIP_NAME ?? 'Personal Dealership').trim();
  const dealership = await prisma.dealership.upsert({
    where: { slug: slugify(dealershipName) },
    create: { name: dealershipName, slug: slugify(dealershipName), settings: {} },
    update: { name: dealershipName },
  });

  const ownerUserId = (process.env.SEED_OWNER_USER_ID ?? 'owner').trim();
  const existingOwner = await prisma.user.findUnique({ where: { userId: ownerUserId } });
  if (!existingOwner) {
    const password = process.env.SEED_OWNER_PASSWORD?.trim();
    if (!password || password.length < 12) {
      throw new Error('SEED_OWNER_PASSWORD with at least 12 characters is required to create the owner');
    }
    await prisma.user.create({
      data: {
        userId: ownerUserId,
        email: (process.env.SEED_OWNER_EMAIL ?? 'owner@example.invalid').trim(),
        name: 'XConsole Owner',
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        role: Role.OWNER,
        status: UserStatus.ACTIVE,
        dealershipId: dealership.id,
        aiEnabled: true,
        permissions: [],
        creditBalanceMicros: 0,
        freeCreditGrantedMicros: 0,
        lifetimeCreditMicros: 0,
      },
    });
  }
  process.stdout.write('XConsole seed completed without changing an existing owner password.\n');
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
