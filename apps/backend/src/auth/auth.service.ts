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

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  // SPACE_MANAGER: creates a brand-new space (spaceName required).

  role: 'SPACE_MANAGER' | 'MEMBER';
  spaceName?: string;
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
      return this.signupAsMember(input.name, input.email, passwordHash);
    }

    return this.signupAsSpaceManager(
      input.name,
      input.email,
      passwordHash,
      input.spaceName!,
    );
  }
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

  private async signupAsMember(
    name: string,
    email: string,
    passwordHash: string,
  ) {
    try {
      const user = await this.prisma.user.create({
        data: {
          name,
          email,
          password: passwordHash,
          role: Role.MEMBER,
          spaceId: null,
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

  buildAuthResult(user: {

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
