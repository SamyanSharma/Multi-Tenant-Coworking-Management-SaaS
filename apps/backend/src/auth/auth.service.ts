import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify, slugifyWithSuffix } from './slugify.util';

export interface JwtPayload {
  // Standard JWT claim name for "subject" — the user id.
  sub: string;
  role: string;
  spaceId: string | null;
}

const MAX_SLUG_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Same generic error whether the email doesn't exist or the
    // password is wrong — don't let the response leak which emails
    // are registered.
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildAuthResult(user);
  }

  // Space Manager self-signup: creates a brand-new Space and its
  // first user (always SPACE_MANAGER — there's no self-serve path to
  // PLATFORM_ADMIN or to MEMBER, since MEMBER requires joining an
  // *existing* space, which this doesn't handle) in one transaction,
  // then logs them straight in.
  async signup(
    name: string,
    email: string,
    password: string,
    spaceName: string,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException(
        'An account with this email already exists',
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const slug =
        attempt === 0 ? slugify(spaceName) : slugifyWithSuffix(spaceName);

      try {
        const { space, user } = await this.prisma.$transaction(
          async (tx) => {
            const space = await tx.space.create({
              data: { name: spaceName, slug },
            });

            const user = await tx.user.create({
              data: {
                name,
                email,
                password: passwordHash,
                role: Role.SPACE_MANAGER,
                spaceId: space.id,
              },
            });

            return { space, user };
          },
        );

        return this.buildAuthResult(user);
      } catch (err) {
        // P2002 = unique constraint violation. Only retry with a new
        // slug if the *slug* collided — an email collision won't fix
        // itself on retry, so surface that immediately instead of
        // silently trying 5 times to fail the same way.
        const isUniqueViolation =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002';

        const collidedOnEmail =
          isUniqueViolation &&
          (err.meta?.target as string[] | undefined)?.includes('email');

        if (!isUniqueViolation || collidedOnEmail) {
          if (collidedOnEmail) {
            throw new ConflictException(
              'An account with this email already exists',
            );
          }
          throw err;
        }
        // else: slug collided — loop and try slugifyWithSuffix next.
      }
    }

    throw new ConflictException(
      'Could not generate a unique space identifier — try a different space name',
    );
  }

  private buildAuthResult(user: {
    id: string;
    email: string;
    name: string | null;
    role: Role;
    spaceId: string | null;
  }) {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      spaceId: user.spaceId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        spaceId: user.spaceId,
      },
    };
  }
}
