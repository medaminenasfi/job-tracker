import {
  Controller,
  Get,
  Param,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@Request() req: { user: { id: string } }) {
    return this.service.list(req.user.id);
  }

  @Patch(':id/read')
  markRead(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.service.markRead(req.user.id, id);
  }

  @Patch('read-all')
  markAllRead(@Request() req: { user: { id: string } }) {
    return this.service.markAllRead(req.user.id);
  }
}
