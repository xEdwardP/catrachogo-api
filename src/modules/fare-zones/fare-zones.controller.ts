import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FareZonesService } from './fare-zones.service';
import { FareZoneDto } from './dto/fare-zone.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('fare-zones')
export class FareZonesController {
  constructor(private fareZonesService: FareZonesService) {}

  @Get()
  list() {
    return this.fareZonesService.list();
  }
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin/fare-zones')
export class AdminFareZonesController {
  constructor(private fareZonesService: FareZonesService) {}

  @Post()
  create(@Body() dto: FareZoneDto) {
    return this.fareZonesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<FareZoneDto>) {
    return this.fareZonesService.update(id, dto);
  }
}
