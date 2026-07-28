import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { SurveyController } from './survey.controller.js';
import { SurveyService } from './survey.service.js';
import { SurveyAdminController } from './survey-admin.controller.js';
import { SurveyAdminService } from './survey-admin.service.js';
import { SurveyResponsesController } from './survey-responses.controller.js';

/**
 * Module Survey — sở hữu sáu bảng khảo sát onboarding (migration 0012).
 *
 * Import IdentityModule để dùng `WebSessionGuard` và AdminModule để dùng
 * `AdminPermissionGuard`. Cả hai là capability của module khác; module này chỉ tiêu thụ chứ
 * không khai lại provider (modular.md mục 1.2).
 *
 * BA CONTROLLER cho ba đối tượng khác nhau — ranh giới permission đọc được từ danh sách này:
 *   - `SurveyController`           người dùng cuối, chỉ phiên đăng nhập, chỉ dữ liệu của họ
 *   - `SurveyAdminController`      biên tập nội dung, `content:read|manage|publish`
 *   - `SurveyResponsesController`  đọc kết quả, `survey_response:read` — dữ liệu cá nhân
 *
 * Hai service tách theo cùng ranh giới: `SurveyService` chỉ thấy những gì `active`, còn
 * `SurveyAdminService` thấy mọi trạng thái. Gộp lại thì mỗi truy vấn phải mang một cờ "đang
 * là admin hay không", và cờ đó chính là chỗ để một hàng `draft` rò ra người dùng.
 *
 * KHÔNG export gì. Chưa module nào cần đọc dữ liệu khảo sát, và mở service ra ngoài là mời
 * module khác chạm vào dữ liệu cá nhân mà không đi qua guard — bài học đã ghi ở
 * `CatalogModule`.
 *
 * Ranh giới với module Account: Survey **đọc** `accounts.id` qua khoá ngoại nhưng KHÔNG ghi
 * vào bảng đó. Trạng thái "đã onboard" suy ra từ `survey_responses` của chính mình, cố ý
 * không thêm cột vào `accounts` (modular.md mục 1.2).
 */
@Module({
  imports: [IdentityModule, AdminModule],
  controllers: [SurveyController, SurveyAdminController, SurveyResponsesController],
  providers: [SurveyService, SurveyAdminService],
})
export class SurveyModule {}
