import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { WebSessionGuard } from '../identity/web-session.guard.js';
import { CatalogService, type PublicApplicationView } from './catalog.service.js';

/**
 * API danh mục cho người dùng cuối (P3).
 *
 * CHỈ trả app `active`. App `draft` và `inactive` không xuất hiện ở đây, kể cả khi người
 * dùng đoán đúng `key` — xem `getPublicByKey`.
 *
 * ĐIỀU QUAN TRỌNG NHẤT: **thấy app KHÔNG có nghĩa là được dùng app.**
 *
 * Endpoint này trả lời "app nào tồn tại và đang phát hành". Nó KHÔNG trả lời "người này
 * có quyền mở app đó không" — câu đó thuộc entitlement (P4). Ứng dụng đích vẫn phải tự
 * xác thực và phân quyền; nút mở app trong Hub không phải là giấy phép.
 *
 * Yêu cầu phiên đăng nhập: danh mục app nội bộ không phải thông tin công khai.
 */
@Controller({ path: 'catalog/applications', version: '1' })
@UseGuards(WebSessionGuard)
export class CatalogController {
  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`.
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get()
  async list(): Promise<PublicApplicationView[]> {
    return this.catalog.listPublic();
  }

  /**
   * Tra theo `key` chứ không phải `id`.
   *
   * `key` là định danh ổn định mà con người đọc được và URL dùng được (`/apps/ke-toan`).
   * `id` là chi tiết nội bộ, không cần lộ ra đường công khai.
   */
  @Get(':key')
  async getByKey(@Param('key') key: string): Promise<PublicApplicationView> {
    const application = await this.catalog.getPublicByKey(key.toLowerCase());

    // 404 cho cả "không tồn tại" lẫn "tồn tại nhưng chưa phát hành" — phân biệt hai
    // trường hợp cho phép dò xem hệ thống đang chuẩn bị những app nào.
    if (!application) throw new NotFoundException('Không tìm thấy ứng dụng.');

    return application;
  }
}
