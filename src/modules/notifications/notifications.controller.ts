import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  Post,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { NotificationsService } from './notifications.service';

@UseGuards(AuthGuard('jwt'))
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Post('push-token')
  registerPushToken(@Request() req, @Body() dto: RegisterPushTokenDto) {
    return this.notifications.registerPushToken(req.user.userId, dto.token);
  }

  @Delete('push-token')
  unregisterPushToken(@Request() req) {
    return this.notifications.unregisterPushToken(req.user.userId);
  }

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
