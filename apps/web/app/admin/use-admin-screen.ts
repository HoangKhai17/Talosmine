'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../../lib/api-client';

/**
 * Vòng đời chung của một màn hình quản trị: tải danh sách, chạy mutation, tải lại, báo kết quả.
 *
 * VÌ SAO TÁCH RA: mọi màn hình quản trị lặp lại đúng bốn thứ dưới đây, và ba trong số đó rất
 * dễ làm sai một cách âm thầm.
 *
 *   1. **401 phải đưa về đăng nhập, không hiện lỗi.** Phiên hết hạn giữa chừng là chuyện
 *      thường; hiện "Bạn không có quyền" ở đó khiến người vận hành tưởng bị thu quyền.
 *   2. **Tải lại SAU mutation.** Cập nhật state cục bộ theo kết quả mong đợi sẽ lệch với
 *      server ở đúng những ca hiếm — ví dụ `sortOrder` server tự gán.
 *   3. **Đưa focus về vùng thông báo.** `aria-live` một mình không đủ khi thao tác vừa xoá
 *      chính phần tử đang giữ focus: focus rơi về `<body>` và người dùng bàn phím mất chỗ.
 *   4. Khoá nút trong lúc chờ, để hai lần bấm không thành hai request.
 *
 * `returnTo` là đường dẫn quay lại sau khi đăng nhập — luôn truyền đường dẫn CỦA CHÍNH trang
 * đang mở, nếu không người dùng sẽ bị ném về một trang khác sau khi đăng nhập lại.
 */
export function useAdminScreen<T>(options: { path: string; returnTo: string; initial: T }) {
  const { path, returnTo, initial } = options;

  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const noticeRef = useRef<HTMLDivElement>(null);

  const redirectToLogin = useCallback(() => {
    window.location.href = `/auth?returnTo=${encodeURIComponent(returnTo)}`;
  }, [returnTo]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<T>(path));
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        redirectToLogin();
        return;
      }
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu.');
    } finally {
      setLoading(false);
    }
  }, [path, redirectToLogin]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const mutate = useCallback(
    async (action: () => Promise<unknown>, success: string) => {
      setPending(true);
      setError(null);
      setNotice(null);
      try {
        await action();
        await reload();
        setNotice(success);
        noticeRef.current?.focus();
      } catch (err) {
        if (err instanceof ApiError && err.isUnauthenticated) {
          redirectToLogin();
          return;
        }
        setError(err instanceof Error ? err.message : 'Không thực hiện được.');
      } finally {
        setPending(false);
      }
    },
    [reload, redirectToLogin],
  );

  return { data, loading, error, notice, pending, reload, mutate, noticeRef };
}

/** Kiểu của `mutate` — để component con nhận nó qua prop mà không phải khai lại chữ ký. */
export type AdminMutate = (action: () => Promise<unknown>, success: string) => Promise<void>;
