import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  check() {
    const databaseConnected = this.connection.readyState === 1;

    // Let the global filter/interceptor build the envelope — a disconnected
    // DB is a real error (503), not a 200 with success:false.
    if (!databaseConnected) {
      throw new ServiceUnavailableException('Database not connected');
    }

    return { api: 'ok', database: 'connected' };
  }
}
