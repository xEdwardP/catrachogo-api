import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('ratings')
export class RatingsController {
  constructor(private ratingsService: RatingsService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateRatingDto) {
    return this.ratingsService.createRating(req.user.userId, dto);
  }

  @Get('user/:id')
  getForUser(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ratingsService.getRatingsForUser(
      id,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }
}
