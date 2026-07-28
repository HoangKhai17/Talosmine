import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { AdminPermissionGuard, RequirePermission } from '../admin/admin-permission.guard.js';
import { WebSessionGuard } from '../identity/web-session.guard.js';
import { SURVEY_LOCALES, type SurveyLocale } from './schema.js';
import { toHttp } from './survey-admin.controller.js';
import {
  SurveyAdminService,
  type SurveyResponseRecordView,
  type SurveySummaryView,
} from './survey-admin.service.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * ĐỌC KẾT QUẢ khảo sát.
 *
 * CONTROLLER RIÊNG, không gộp vào `SurveyAdminController`, vì permission khác hẳn:
 * `survey_response:read` chứ không phải `content:*`. Đặt chung một lớp thì mỗi method phải
 * tự nhớ khai đúng permission, và một `@RequirePermission` gõ nhầm ở đây sẽ mở dữ liệu cá
 * nhân của mọi người dùng cho bất kỳ ai sửa được nội dung. Tách lớp khiến ranh giới đó đọc
 * được từ tên file.
 *
 * CHỈ CÓ ĐƯỜNG ĐỌC. Câu trả lời đã nộp là dữ liệu lịch sử — role runtime cũng không được cấp
 * `UPDATE`/`DELETE` trên hai bảng này (migration 0012), nên không có API nào sửa được kể cả
 * khi ai đó thêm nhầm.
 *
 * Thời hạn lưu và chính sách ẩn danh hoá thuộc **DEC-B11**, đang `open` — không có thời hạn
 * nào được viết vào code.
 */
@Controller({ path: 'admin/survey', version: '1' })
@UseGuards(WebSessionGuard, AdminPermissionGuard)
export class SurveyResponsesController {
  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`.
  constructor(@Inject(SurveyAdminService) private readonly survey: SurveyAdminService) {}

  /**
   * Số liệu tổng hợp — thứ trả lời đúng mục đích thu thập.
   *
   * KHÔNG trả `accountId`: biết mỗi lựa chọn được chọn bao nhiêu lần không cần biết ai chọn.
   */
  @Get('summary')
  @RequirePermission('survey_response:read')
  async summary(@Query('locale') locale?: string): Promise<SurveySummaryView> {
    if (!isLocale(locale)) {
      throw new BadRequestException(`\`locale\` phải là một trong: ${SURVEY_LOCALES.join(', ')}.`);
    }
    return this.survey.summary(locale);
  }

  /** Danh sách chi tiết — chỉ dùng khi cần điều tra một trường hợp cụ thể. */
  @Get('responses')
  @RequirePermission('survey_response:read')
  async listResponses(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<{ items: SurveyResponseRecordView[]; nextCursor: string | null }> {
    const parsed = Number.parseInt(limit ?? String(DEFAULT_LIMIT), 10);
    const safeLimit = Number.isNaN(parsed)
      ? DEFAULT_LIMIT
      : Math.min(Math.max(parsed, 1), MAX_LIMIT);

    try {
      return await this.survey.listResponses({ limit: safeLimit, cursor });
    } catch (error) {
      throw toHttp(error);
    }
  }
}

function isLocale(value: unknown): value is SurveyLocale {
  return typeof value === 'string' && (SURVEY_LOCALES as readonly string[]).includes(value);
}
