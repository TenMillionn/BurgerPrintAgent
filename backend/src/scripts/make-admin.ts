import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';

/**
 * Promote a user to admin by email.
 * Usage: node dist/scripts/make-admin.js <email>
 */
async function main() {
  const email = process.argv[2];
  const logger = new Logger('make-admin');
  if (!email) {
    logger.error('Usage: node dist/scripts/make-admin.js <email>');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const users = app.get(UsersService);
    const ok = await users.promoteToAdmin(email);
    if (ok) {
      logger.log(`User ${email} is now an admin.`);
    } else {
      logger.error(`No user found with email ${email}.`);
      process.exitCode = 2;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
