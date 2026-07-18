import { Module } from '@nestjs/common';
import { TripCandidatesCache } from './trip-candidates.cache';

@Module({
  providers: [TripCandidatesCache],
  exports: [TripCandidatesCache],
})
export class MatchingModule {}