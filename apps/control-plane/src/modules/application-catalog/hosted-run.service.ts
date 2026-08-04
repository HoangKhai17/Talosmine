import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { loadEnv } from '../../shared/env.js';
import { OutboundError } from '../../shared/outbound-fetch.js';
import { parseAllowedHosts, type UrlPolicyOptions } from '../../shared/url-policy.js';
import { appendAuditEvent } from '../audit/audit.js';
import { runHuggingFace } from './providers/huggingface.js';
import { applicationHostedBindings, applications, type HostedProvider } from './schema.js';

/**
 * Chạy một ứng dụng `hosted` — DEC-B17.
 *
 * ĐÂY LÀ CHỖ DUY NHẤT Control Plane gọi ra Internet thay mặt người dùng. Trước DEC-B17 nó
 * không tồn tại: Hub chỉ mở link ra ngoài, mọi lưu lượng nghiệp vụ đi thẳng tới app.
 *
 * BỐN BẤT BIẾN, mỗi cái chặn một loại sai:
 *
 * 1. **Chỉ app `active` VÀ `hosted` mới chạy được.** `draft`/`inactive`/`external_link` trả
 *    NOT_FOUND giống hệt app không tồn tại — cùng bất biến với `getPublicByKey`. Phân biệt
 *    các trường hợp cho phép dò trạng thái hệ thống.
 *
 * 2. **Mọi lượt chạy để lại dấu vết.** App chạy trong nhà không phải lý do để bỏ qua audit.
 *
 * 3. **Lỗi upstream không vọng nguyên văn ra ngoài.** Chúng có thể chứa cấu hình nội bộ.
 *
 * 4. **CHƯA trừ điểm tín dụng, CHƯA ghi `usage_metrics`.** DEC-B18 đã chốt hướng nhưng cơ
 *    chế sub chưa chốt, và `usage_metrics.unit` còn chặn bởi DEC-B05. Ghi ra đây để lần rà
 *    sau không tưởng là bỏ sót.
 */

export class HostedRunError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'NOT_CONFIGURED' | 'PROVIDER_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'HostedRunError';
  }
}

export interface HostedRunContext {
  accountId: string;
  correlationId?: string | undefined;
}

@Injectable()
export class HostedRunService {
  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`.
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  private urlPolicyOptions(): UrlPolicyOptions {
    const env = loadEnv();
    return {
      allowedHosts: parseAllowedHosts(env.CATALOG_ALLOWED_HOSTS),
      allowInsecureLoopback: env.NODE_ENV === 'development',
    };
  }

  /**
   * Đọc khoá API của một nhà cung cấp.
   *
   * Thiếu khoá là lỗi CẤU HÌNH của người vận hành, không phải lỗi của người dùng — nên nó
   * có mã riêng (`NOT_CONFIGURED` → 503) chứ không gộp vào lỗi chung. Người vận hành cần
   * biết chính xác phải sửa gì.
   */
  private apiToken(provider: HostedProvider): string {
    const env = loadEnv();
    const token = provider === 'huggingface' ? env.HUGGINGFACE_API_TOKEN : undefined;

    if (!token) {
      throw new HostedRunError(
        'NOT_CONFIGURED',
        `Chưa cấu hình khoá API cho nhà cung cấp \`${provider}\`.`,
      );
    }
    return token;
  }

  async run(key: string, input: string, ctx: HostedRunContext): Promise<string> {
    const rows = await this.database.db
      .select({
        id: applications.id,
        key: applications.key,
        provider: applicationHostedBindings.provider,
        endpointUrl: applicationHostedBindings.endpointUrl,
        model: applicationHostedBindings.model,
        timeoutMs: applicationHostedBindings.timeoutMs,
      })
      .from(applications)
      // INNER JOIN có chủ đích: app `hosted` chưa có binding thì KHÔNG chạy được, và câu
      // trả lời phải giống hệt "không tìm thấy" — không có gì để gọi thì không có gì để nói.
      .innerJoin(
        applicationHostedBindings,
        eq(applicationHostedBindings.applicationId, applications.id),
      )
      .where(
        and(
          eq(applications.key, key),
          eq(applications.status, 'active'),
          eq(applications.kind, 'hosted'),
        ),
      )
      .limit(1);

    const app = rows[0];
    if (!app) throw new HostedRunError('NOT_FOUND', 'Không tìm thấy ứng dụng.');

    const provider = app.provider as HostedProvider;
    const token = this.apiToken(provider);

    let output: string;
    try {
      output = await runHuggingFace(
        {
          endpointUrl: app.endpointUrl,
          model: app.model,
          input,
          apiToken: token,
          timeoutMs: app.timeoutMs,
        },
        this.urlPolicyOptions(),
      );
    } catch (error) {
      // Ghi audit CẢ KHI THẤT BẠI. Một lượt chạy hỏng vẫn là một lần Hub gọi ra ngoài thay
      // mặt người dùng — bỏ qua nó nghĩa là nhật ký chỉ kể nửa câu chuyện, và nửa bị giấu
      // lại đúng là nửa cần điều tra.
      await this.audit(app.id, app.key, ctx, {
        outcome: 'failed',
        code: error instanceof OutboundError ? error.code : 'UNKNOWN',
      });

      throw new HostedRunError(
        'PROVIDER_FAILED',
        error instanceof OutboundError ? error.message : 'Nhà cung cấp không phản hồi hợp lệ.',
      );
    }

    await this.audit(app.id, app.key, ctx, { outcome: 'succeeded' });
    return output;
  }

  /**
   * Một dòng audit cho mỗi lượt chạy.
   *
   * KHÔNG ghi nội dung đầu vào/đầu ra: đó là dữ liệu của người dùng, có thể chứa bất cứ thứ
   * gì họ dán vào, và `audit_events` là bảng không xoá được. Chỉ ghi việc "ai chạy app nào,
   * lúc nào, kết quả ra sao" — đủ để truy trách nhiệm mà không biến nhật ký thành kho dữ
   * liệu cá nhân.
   */
  private async audit(
    applicationId: string,
    applicationKey: string,
    ctx: HostedRunContext,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.accountId },
        action: 'application.hosted_run',
        targetType: 'application',
        targetId: applicationId,
        targetKey: applicationKey,
        correlationId: ctx.correlationId,
        details,
      });
    });
  }
}
