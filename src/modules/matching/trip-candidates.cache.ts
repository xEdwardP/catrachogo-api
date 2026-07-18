import { Injectable } from '@nestjs/common';

@Injectable()
export class TripCandidatesCache {
  private cache = new Map<string, { drivers: string[]; expiresAt: number }>();

  set(tripId: string, drivers: string[], ttlMs = 60_000) {
    this.cache.set(tripId, { drivers, expiresAt: Date.now() + ttlMs });
  }
  isCandidate(tripId: string, driverId: string): boolean {
    const entry = this.cache.get(tripId);
    return (
      !!entry &&
      entry.expiresAt > Date.now() &&
      entry.drivers.includes(driverId)
    );
  }
  getPendingFor(driverId: string): string | null {
    for (const [tripId, entry] of this.cache.entries()) {
      if (entry.expiresAt > Date.now() && entry.drivers.includes(driverId))
        return tripId;
    }
    return null;
  }
  removeDriver(tripId: string, driverId: string) {
    const entry = this.cache.get(tripId);
    if (entry) entry.drivers = entry.drivers.filter((d) => d !== driverId);
  }
  clear(tripId: string) {
    this.cache.delete(tripId);
  }
}
