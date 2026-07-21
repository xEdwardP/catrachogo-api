import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';

@UseGuards(AuthGuard('jwt'))
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list(
      req.user.userId,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  @Get('unread-count')
  unreadCount(@Request() req) {
    return this.notifications.unreadCount(req.user.userId);
  }

  @Patch(':id/read')
  markRead(@Request() req, @Param('id') id: string) {
    return this.notifications.markRead(id, req.user.userId);
  }

  @Patch('read-all')
  markAllRead(@Request() req) {
    return this.notifications.markAllRead(req.user.userId);
  }
}
