import { Injectable, Logger } from '@nestjs/common';
import { createDatabaseClient, type DatabaseClient } from '../../shared/database.js';
import { loadEnv } from '../../shared/env.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private client: DatabaseClient | undefined;

  /**
   * Readiness check. Trả về boolean — KHÔNG ném lỗi ra ngoài và KHÔNG trả chi tiết lỗi,
   * vì health endpoint không được lộ topology hay lý do nội bộ (phase-1 mục 9).
   * Chi tiết chỉ đi vào log server.
   */
  async checkDependencies(): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.sql`SELECT 1`;
      return true;
    } catch (err) {
      this.logger.warn({ err }, 'Readiness check thất bại: không truy vấn được database');
      return false;
    }
  }

  private getClient(): DatabaseClient {
    if (!this.client) {
      const env = loadEnv();
      this.client = createDatabaseClient(env.DATABASE_URL);
    }
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.sql.end({ timeout: 5 });
  }
}
