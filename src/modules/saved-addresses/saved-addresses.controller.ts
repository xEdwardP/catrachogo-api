import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SavedAddressesService } from './saved-addresses.service';
import { CreateSavedAddressDto } from './dto/create-saved-address.dto';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('passenger')
@Controller('saved-addresses')
export class SavedAddressesController {
  constructor(private savedAddressesService: SavedAddressesService) {}

  @Get()
  list(@Request() req) {
    return this.savedAddressesService.list(req.user.userId);
  }

  @Post()
  create(@Request() req, @Body() dto: CreateSavedAddressDto) {
    return this.savedAddressesService.create(req.user.userId, dto);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.savedAddressesService.remove(req.user.userId, id);
  }
}
