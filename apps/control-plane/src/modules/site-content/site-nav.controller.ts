import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { NAV_LOCALES, type NavLocale } from './schema.js';
import { SiteNavService, type SiteNavView } from './site-nav.service.js';

/**
 * Điều hướng cho người dùng cuối.
 *
 * KHÔNG CÓ GUARD — đây là bề mặt công khai duy nhất của Control Plane.
 *
 * Vì sao: header và footer render trên MỌI trang, kể cả với khách chưa đăng nhập. Bắt buộc
 * phiên ở đây nghĩa là trang chủ không dựng nổi menu cho người lạ.
 *
 * An toàn vì dữ liệu trả về đúng bằng những gì đã hiển thị công khai: chỉ mục `active`, chỉ
 * nhãn và đường dẫn. Không `status`, không id nội bộ nào ngoài id của chính mục, không lộ
 * mục `draft` — tức không cho ai dò xem trang đang chuẩn bị thêm menu gì.
 */
@Controller({ path: 'site/nav', version: '1' })
export class SiteNavController {
  constructor(@Inject(SiteNavService) private readonly nav: SiteNavService) {}

  @Get()
  async get(@Query('locale') locale?: string): Promise<SiteNavView> {
    if (!isNavLocale(locale)) {
      throw new BadRequestException(`\`locale\` phải là một trong: ${NAV_LOCALES.join(', ')}.`);
    }
    return this.nav.getPublicNav(locale);
  }
}

function isNavLocale(value: unknown): value is NavLocale {
  return typeof value === 'string' && (NAV_LOCALES as readonly string[]).includes(value);
}
