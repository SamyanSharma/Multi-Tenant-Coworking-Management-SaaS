import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify, slugifyWithSuffix } from './slugify.util';
import { LIVE } from '../common/live';

export interface JwtPayload {
  // Standard JWT claim name for "subject" — the user id.
  sub: string;
  role: string;
  spaceId: string | null;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  // SPACE_MANAGER: creates a brand-new space (spaceName required).
  // MEMBER: joins an existing space, either by id (browsed from
  // GET /spaces/public) or by its slug (typed in as a join code) —
  // at least one of the two is required. There's still no self-serve
  // path to PLATFORM_ADMIN.
  role: 'SPACE_MANAGER' | 'MEMBER';
  spaceName?: string;
  spaceId?: string;
  spaceSlug?: string;
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

  async signup(input: SignupInput) {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new ConflictException(
        'An account with this email already exists',
      );
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    if (input.role === 'MEMBER') {
      return this.signupAsMember(input.name, input.email, passwordHash, {
        spaceId: input.spaceId,
        spaceSlug: input.spaceSlug,
      });
    }

    return this.signupAsSpaceManager(
      input.name,
      input.email,
      passwordHash,
      input.spaceName!,
    );
  }

  // "List my space": creates a brand-new Space and its first user
  // (SPACE_MANAGER) in one transaction, then logs them straight in.
  private async signupAsSpaceManager(
    name: string,
    email: string,
    passwordHash: string,
    spaceName: string,
  ) {
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const slug =
        attempt === 0 ? slugify(spaceName) : slugifyWithSuffix(spaceName);

      try {
        const { user } = await this.prisma.$transaction(async (tx) => {
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
        });

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

  // "Rent a space": joins an EXISTING space, either picked from the
  // public directory (spaceId — GET /spaces/public) or by typing the
  // join code a Space Manager shared with them (spaceSlug, still shown
  // on the manager's space page — the two are equivalent ways in, not
  // a replacement of one by the other). A closed space (deletedAt set)
  // is invisible to both paths: its slug is rewritten on close (see
  // schema.prisma), and findFirst's `LIVE` filter excludes it either way.
  private async signupAsMember(
    name: string,
    email: string,
    passwordHash: string,
    target: { spaceId?: string; spaceSlug?: string },
  ) {
    if (!target.spaceId && !target.spaceSlug) {
      throw new BadRequestException(
        'Pick a space to join, or enter a join code',
      );
    }

    const space = await this.prisma.space.findFirst({
      where: {
        ...LIVE,
        ...(target.spaceId ? { id: target.spaceId } : { slug: target.spaceSlug }),
      },
    });

    if (!space) {
      throw new NotFoundException(
        target.spaceId
          ? 'That space is no longer available — pick another from the list'
          : 'No space found with that join code — double check it with your Space Manager',
      );
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          name,
          email,
          password: passwordHash,
          role: Role.MEMBER,
          spaceId: space.id,
        },
      });

      return this.buildAuthResult(user);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw err;
    }
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
