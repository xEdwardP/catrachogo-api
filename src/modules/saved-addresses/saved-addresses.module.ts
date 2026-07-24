import { Module } from '@nestjs/common';
import { SavedAddressesController } from './saved-addresses.controller';
import { SavedAddressesService } from './saved-addresses.service';

@Module({
  controllers: [SavedAddressesController],
  providers: [SavedAddressesService],
})
export class SavedAddressesModule {}
