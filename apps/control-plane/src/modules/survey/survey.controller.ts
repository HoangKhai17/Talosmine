import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { type AuthenticatedRequest, WebSessionGuard } from '../identity/web-session.guard.js';
import type { SubmittedAnswer } from './answer-validation.js';
import { SURVEY_LOCALES, SURVEY_QUESTION_KEYS, type SurveyLocale } from './schema.js';
import {
  type OnboardingSurveyView,
  type OwnSurveyResponseView,
  SurveyError,
  SurveyService,
} from './survey.service.js';

/** Chặn payload phi lý trước khi nó chạm database. */
const MAX_OPTIONS_PER_QUESTION = 50;

interface SubmitBody {
  status?: unknown;
  locale?: unknown;
  answers?: unknown;
}

/**
 * Khảo sát onboarding của chính người dùng.
 *
 * Bảo vệ bằng `WebSessionGuard` — KHÔNG có `AdminPermissionGuard`: đây là bề mặt của người
 * dùng cuối với dữ liệu của chính họ, cùng loại với `/v1/me/account`.
 *
 * Không có `reason` như các endpoint quản trị: người dùng trả lời khảo sát của chính mình
 * không phải một thao tác quản trị cần biện minh, và bắt họ nêu lý do là vô nghĩa.
 */
@Controller({ path: 'me/onboarding', version: '1' })
@UseGuards(WebSessionGuard)
export class SurveyController {
  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`.
  constructor(@Inject(SurveyService) private readonly survey: SurveyService) {}

  @Get()
  async get(
    @Req() request: AuthenticatedRequest,
    @Query('locale') locale?: string,
  ): Promise<OnboardingSurveyView> {
    if (!isLocale(locale)) {
      throw new BadRequestException(`\`locale\` phải là một trong: ${SURVEY_LOCALES.join(', ')}.`);
    }
    return this.survey.getForAccount(this.accountId(request), locale);
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async submit(@Req() request: AuthenticatedRequest, @Body() body: SubmitBody): Promise<void> {
    const status = body.status;
    if (status !== 'completed' && status !== 'skipped') {
      throw new BadRequestException('`status` phải là `completed` hoặc `skipped`.');
    }

    if (!isLocale(body.locale)) {
      throw new BadRequestException(`\`locale\` phải là một trong: ${SURVEY_LOCALES.join(', ')}.`);
    }

    // `answers` chỉ có nghĩa khi hoàn tất. Gửi kèm lúc bỏ qua thì bị bỏ qua im lặng — cùng
    // quy ước với trường lạ ở PATCH của account và catalog.
    const answers = status === 'completed' ? requireAnswers(body.answers) : undefined;

    try {
      await this.survey.submit(this.accountId(request), {
        status,
        locale: body.locale,
        ...(answers !== undefined ? { answers } : {}),
      });
    } catch (error) {
      throw toHttp(error);
    }
  }

  /**
   * Câu trả lời của chính mình, dạng đọc được — DEC-B11 câu 2 (2026-07-30): người dùng được
   * tự xem câu trả lời khảo sát của họ.
   */
  @Get('response')
  async getOwnResponse(
    @Req() request: AuthenticatedRequest,
    @Query('locale') locale?: string,
  ): Promise<OwnSurveyResponseView> {
    if (!isLocale(locale)) {
      throw new BadRequestException(`\`locale\` phải là một trong: ${SURVEY_LOCALES.join(', ')}.`);
    }

    const response = await this.survey.getOwnResponse(this.accountId(request), locale);
    if (!response) {
      throw new NotFoundException('Chưa có câu trả lời khảo sát nào.');
    }
    return response;
  }

  /**
   * Xoá câu trả lời của chính mình — DEC-B11 câu 2. Xoá dữ liệu cá nhân theo yêu cầu chính
   * chủ, không phải thu hồi/vô hiệu hoá.
   */
  @Delete('response')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOwnResponse(@Req() request: AuthenticatedRequest): Promise<void> {
    const deleted = await this.survey.deleteOwnResponse(this.accountId(request));
    if (!deleted) {
      throw new NotFoundException('Chưa có câu trả lời khảo sát nào.');
    }
  }

  /** Account lấy TỪ GUARD (resolve phía server), KHÔNG tin id do client khai. */
  private accountId(request: AuthenticatedRequest): string {
    const accountId = request.auth?.accountId;
    if (!accountId) throw new UnauthorizedException('Thiếu phiên đăng nhập.');
    return accountId;
  }
}

function toHttp(error: unknown): Error {
  if (!(error instanceof SurveyError)) return error as Error;
  return error.code === 'ALREADY_ANSWERED'
    ? new ConflictException(error.message)
    : new BadRequestException(error.message);
}

function isLocale(value: unknown): value is SurveyLocale {
  return typeof value === 'string' && (SURVEY_LOCALES as readonly string[]).includes(value);
}

/**
 * Đọc `answers` một cách phòng thủ.
 *
 * Chỉ kiểm HÌNH DẠNG ở đây (mảng, chuỗi, không rỗng). Luật nghiệp vụ — lựa chọn thuộc đúng
 * câu, đang `active`, đủ số tối thiểu — nằm ở `validateAnswers`, nơi có dữ liệu thật để đối
 * chiếu. Tách hai tầng để không có luật nào bị viết ở hai chỗ rồi lệch nhau.
 */
function requireAnswers(value: unknown): SubmittedAnswer[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException('`answers` phải là mảng không rỗng khi hoàn tất khảo sát.');
  }

  return value.map((raw) => {
    const record = raw as Record<string, unknown> | null;
    const questionKey = record?.questionKey;
    const optionKeys = record?.optionKeys;

    if (
      typeof questionKey !== 'string' ||
      !(SURVEY_QUESTION_KEYS as readonly string[]).includes(questionKey)
    ) {
      throw new BadRequestException(
        `\`questionKey\` phải là một trong: ${SURVEY_QUESTION_KEYS.join(', ')}.`,
      );
    }

    if (!Array.isArray(optionKeys) || optionKeys.length === 0) {
      throw new BadRequestException(
        `\`optionKeys\` của \`${questionKey}\` phải là mảng không rỗng.`,
      );
    }
    if (optionKeys.length > MAX_OPTIONS_PER_QUESTION) {
      throw new BadRequestException(
        `\`optionKeys\` của \`${questionKey}\` vượt quá ${MAX_OPTIONS_PER_QUESTION} phần tử.`,
      );
    }
    for (const key of optionKeys) {
      if (typeof key !== 'string' || key.trim() === '') {
        throw new BadRequestException(`\`optionKeys\` của \`${questionKey}\` chỉ được chứa chuỗi.`);
      }
    }

    return { questionKey, optionKeys: optionKeys as string[] };
  });
}
