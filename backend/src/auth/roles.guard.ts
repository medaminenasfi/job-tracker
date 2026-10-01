import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, UserRole } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role?: UserRole } }>();
    // user.role is loaded fresh from the DB by JwtStrategy.validate on every
    // request, so a demoted admin's previously-issued token stops working at once.
    if (!user || !required.includes(user.role as UserRole)) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
