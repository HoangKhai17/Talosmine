import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '../../apps/control-plane/src/shared/all-exceptions.filter';

/**
 * Mức log của `AllExceptionsFilter`.
 *
 * VÌ SAO FILE NÀY TỒN TẠI: filter là nơi MỌI lỗi của Control Plane đi qua, và trước hôm nay
 * nó **không có test nào**. Nó in mọi exception ở mức `error`, kể cả 4xx — vốn là kết quả
 * bình thường của một API. Cụ thể: `GET /v1/site/logo` khi chưa ai tải logo lên ném 404 mà
 * chính comment trong controller gọi là "tín hiệu… không phải lỗi", vậy mà log hiện ra một
 * khối ERROR đỏ kèm stack trace mỗi lần tải trang.
 *
 * Hậu quả không chỉ là xấu mắt: log đầy ERROR giả khiến ERROR THẬT chìm nghỉm. Người trực
 * đêm sự cố phải loại trừ những dòng vô hại trước khi tới được dòng đáng đọc.
 *
 * BÀI TEST KIỂM HÀNH VI, KHÔNG KIỂM CÂU CHỮ: nó khẳng định 4xx đi vào `warn` và 5xx đi vào
 * `error` kèm stack — không khẳng định thông điệp viết thế nào, vì đó là thứ được phép sửa.
 */

/** `ArgumentsHost` tối thiểu — filter chỉ cần `getResponse()`. */
function fakeHost() {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return {
    host: {
      switchToHttp: () => ({ getResponse: () => reply }),
    } as never,
    reply,
  };
}

describe('AllExceptionsFilter — mức log theo loại lỗi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('404 đi vào `warn`, KHÔNG vào `error`', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const { host } = fakeHost();
    new AllExceptionsFilter().catch(new NotFoundException('Chưa tải logo nào lên.'), host);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('404 KHÔNG kèm stack — `err` chỉ có nghĩa với lỗi của chính ta', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const { host } = fakeHost();
    new AllExceptionsFilter().catch(new NotFoundException('khong thay'), host);

    const payload = warn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(payload).not.toHaveProperty('err');
  });

  it('400 và 403 cũng là `warn` — 4xx nào cũng vậy', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const filter = new AllExceptionsFilter();
    filter.catch(new BadRequestException('thieu truong'), fakeHost().host);
    filter.catch(new ForbiddenException('khong du quyen'), fakeHost().host);

    // 403 vẫn phải THẤY ĐƯỢC khi rà soát bảo mật — `warn` chứ không phải `debug`.
    expect(warn).toHaveBeenCalledTimes(2);
    expect(error).not.toHaveBeenCalled();
  });

  it('lỗi không lường trước vẫn là `error` VÀ vẫn kèm stack', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const boom = new Error('connection string bi lo trong message');
    const { host } = fakeHost();
    new AllExceptionsFilter().catch(boom, host);

    expect(error).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();

    const payload = error.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ status: 500 });
    // Stack CHỈ được phép tồn tại ở log server — đây là nơi duy nhất.
    expect(payload.err).toBe(boom);
  });

  it('5xx KHÔNG để lộ message gốc ra response — ràng buộc cũ, kiểm luôn kẻo sửa mức log làm hỏng', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const { host, reply } = fakeHost();
    new AllExceptionsFilter().catch(new Error('postgres://user:pass@host/db'), host);

    expect(reply.status).toHaveBeenCalledWith(500);
    const body = JSON.stringify(reply.send.mock.calls[0]?.[0]);
    expect(body).not.toContain('postgres://');
  });

  it('4xx GIỮ message chi tiết trong response — đó là thông tin hữu ích cho người gọi', () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const { host, reply } = fakeHost();
    new AllExceptionsFilter().catch(new NotFoundException('Chưa tải logo nào lên.'), host);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(JSON.stringify(reply.send.mock.calls[0]?.[0])).toContain('Chưa tải logo nào lên.');
  });
});
