'use client';

import { BrowserWallet } from '@meshsdk/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectedWallet, InstalledWallet } from './cardano-wallet';

/**
 * Hook kết nối ví CIP-30 qua Mesh SDK.
 *
 * BA ĐIỀU KIỆN MÔI TRƯỜNG khiến file này chỉ chạy được ở trình duyệt: `window.cardano` do
 * extension bơm vào, `BrowserWallet` đọc thẳng biến đó, và `localStorage` giữ lựa chọn ví.
 * Vì vậy component dùng hook này phải được nạp bằng `dynamic(..., { ssr: false })` — xem
 * ghi chú ở `app/[locale]/(user)/wallet/wallet-client.tsx`.
 *
 * VÌ SAO KHÔNG DÙNG `@meshsdk/react`: gói đó chưa có bản phát hành ổn định (chỉ `2.0.0-beta`)
 * và kéo theo radix-ui + tailwind cho bộ nút dựng sẵn của nó. Dự án này dùng CSS Module và
 * không có tailwind, nên bộ nút đó vừa không dùng được vừa nặng. `BrowserWallet` từ
 * `@meshsdk/core` đã là toàn bộ phần CIP-30 cần thiết; phần state chỉ là mấy dòng `useState`.
 */

/** Ví đã chọn lần trước. Không phải `__Host-` cookie: đây là lựa chọn giao diện, không phải phiên. */
const STORAGE_KEY = 'talos_cardano_wallet';

/**
 * Extension bơm `window.cardano` ở `document_idle`, tức là CÓ THỂ muộn hơn lúc React mount.
 * Quét một lần duy nhất sẽ ra danh sách rỗng trên máy chậm hoặc khi có nhiều extension —
 * người dùng thấy "chưa cài ví nào" dù ví đang bật. Quét lại vài nhịp ngắn rẻ hơn nhiều so
 * với việc bắt người dùng tải lại trang.
 */
const RESCAN_DELAYS_MS = [300, 1000, 2500];

/**
 * Mã lỗi, KHÔNG PHẢI CÂU CHỮ.
 *
 * Hook nằm ngoài tầm với của catalog i18n (nó là mã dùng chung, không nhận `t`), nên nếu nó
 * tự dựng câu thì câu đó chỉ có một thứ tiếng — bản tiếng Anh sẽ lặng lẽ hiện tiếng Việt.
 * Trả về mã rồi để component tra `labels` thì cả hai ngôn ngữ đều đi qua đúng một đường.
 */
export type WalletErrorCode =
  /** Người dùng bấm "Huỷ" trong cửa sổ ví. Không phải hỏng hóc. */
  | 'declined'
  /** Kênh nối tới extension đã chết — xem `describe()`. Chỉ tải lại trang mới cứu được. */
  | 'stale'
  /** Ví biến mất khỏi `window.cardano` giữa lúc quét và lúc bấm. */
  | 'missing'
  | 'unknown';

export type WalletError = {
  code: WalletErrorCode;
  /** Chuỗi thô của ví, chỉ dùng cho `unknown` — giữ lại để còn lần ra được lỗi lạ. */
  detail: string | null;
};

export interface CardanoWalletState {
  /** `null` = chưa quét xong. Mảng rỗng = quét xong và thật sự không có ví nào. */
  installed: InstalledWallet[] | null;
  connected: ConnectedWallet | null;
  /** `id` của ví đang trong lúc chờ người dùng bấm đồng ý, hoặc `null`. */
  pendingId: string | null;
  error: WalletError | null;
  connect: (id: string) => void;
  disconnect: () => void;
  refresh: () => void;
}

/**
 * Ba trường đủ để mở lại kết nối và dựng lại thẻ ví.
 *
 * Hẹp hơn `InstalledWallet` có chủ đích: `refresh()` chỉ có trong tay một `ConnectedWallet`
 * (không mang `version`). Nhận đúng phần cần dùng thì cả hai chỗ gọi đều hợp lệ mà không
 * phải ép kiểu hay bịa ra một `version` rỗng.
 */
type WalletIdentity = Pick<InstalledWallet, 'id' | 'name' | 'icon'>;

/**
 * Đọc thông tin ví sau khi đã được cấp quyền.
 *
 * `getBalance()` tách riêng khỏi `Promise.all` vì nó là bước DUY NHẤT phải giải mã CBOR, tức
 * là bước duy nhất hỏng được vì lý do không liên quan gì tới kết nối. Gộp chung thì một ví
 * trả về value lạ sẽ làm cả lần kết nối thất bại, trong khi thực tế mọi thứ khác đều ổn.
 */
async function readWallet(meta: WalletIdentity): Promise<ConnectedWallet> {
  const wallet = await BrowserWallet.enable(meta.id);

  const [networkId, address] = await Promise.all([
    wallet.getNetworkId(),
    wallet.getChangeAddress(),
  ]);

  let lovelace: string | null = null;
  try {
    const balance = await wallet.getBalance();
    lovelace = balance.find((asset) => asset.unit === 'lovelace')?.quantity ?? '0';
  } catch {
    // Có chủ đích: nuốt lỗi. Xem ghi chú `lovelace` ở `cardano-wallet.ts`.
  }

  return { id: meta.id, name: meta.name, icon: meta.icon, address, networkId, lovelace };
}

/**
 * Phân loại lỗi ví thành mã xử lý được.
 *
 * Lỗi từ extension KHÔNG phải `Error` chuẩn — Mesh bọc lại thành chuỗi JSON, nên chỉ có cách
 * so khớp trên văn bản. Xấu, nhưng CIP-30 không quy định mã lỗi nào cả.
 *
 * `stale` là trường hợp đáng nói nhất, đã gặp thật với Lace:
 *
 *   RemoteApiShutdownError: Remote API with channel 'cardano-authenticator' was shutdown:
 *   object can no longer be used.
 *
 * Nghĩa là service worker của extension đã ngủ/khởi động lại (hoặc ví bị khoá) SAU KHI trang
 * tải xong, nên đối tượng mà `window.cardano` bơm vào lúc đầu đã chết. Thử `enable()` lại
 * cũng vô ích vì kênh nối đã đóng — **chỉ tải lại trang mới lấy được đối tượng mới**. Vì vậy
 * nó cần thông điệp riêng kèm nút tải lại, chứ không phải một câu "kết nối thất bại" khiến
 * người dùng bấm lại mãi không được.
 */
function classify(cause: unknown): WalletError {
  const raw = cause instanceof Error ? cause.message : String(cause);

  // Kiểm `stale` TRƯỚC: chuỗi của nó dài và có thể chứa từ trùng với các mẫu bên dưới.
  if (/shutdown|no longer be used|remoteapi|disconnected port/i.test(raw)) {
    return { code: 'stale', detail: null };
  }
  if (/refus|reject|declin|cancel|denied/i.test(raw)) {
    return { code: 'declined', detail: null };
  }
  return { code: 'unknown', detail: raw };
}

export function useCardanoWallet(): CardanoWalletState {
  const [installed, setInstalled] = useState<InstalledWallet[] | null>(null);
  const [connected, setConnected] = useState<ConnectedWallet | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<WalletError | null>(null);

  /**
   * Chặn hai thứ: effect chạy hai lần trong StrictMode (`reactStrictMode: true` ở
   * `next.config.ts`), và việc `setState` sau khi component đã bị gỡ.
   */
  const mounted = useRef(true);
  const autoConnectTried = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ── Quét ví đã cài ──────────────────────────────────────────────────────────
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    const scan = () => {
      if (!mounted.current) return;
      // `getInstalledWallets` đọc `window.cardano` một cách đồng bộ và tự bỏ qua mục hỏng,
      // nên nó không ném — không cần bọc try/catch ở đây.
      setInstalled(BrowserWallet.getInstalledWallets());
    };

    scan();
    for (const delay of RESCAN_DELAYS_MS) timers.push(setTimeout(scan, delay));

    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  const connectTo = useCallback(async (meta: WalletIdentity, silent: boolean) => {
    setPendingId(meta.id);
    setError(null);
    try {
      const next = await readWallet(meta);
      if (!mounted.current) return;
      setConnected(next);
      window.localStorage.setItem(STORAGE_KEY, meta.id);
    } catch (cause) {
      if (!mounted.current) return;
      // Lần nối lại tự động THẤT BẠI TRONG IM LẶNG: người dùng chưa bấm gì cả, nên một
      // thông báo đỏ hiện ra lúc mở trang chỉ gây hoang mang. Xoá lựa chọn cũ rồi thôi.
      window.localStorage.removeItem(STORAGE_KEY);
      if (!silent) setError(classify(cause));
    } finally {
      if (mounted.current) setPendingId(null);
    }
  }, []);

  // ── Nối lại ví đã chọn lần trước ────────────────────────────────────────────
  useEffect(() => {
    if (installed === null || autoConnectTried.current) return;
    autoConnectTried.current = true;

    const savedId = window.localStorage.getItem(STORAGE_KEY);
    if (savedId === null) return;

    /**
     * Chỉ nối lại khi ví ĐÓ vẫn còn cài. Gọi `enable()` cho một ví đã gỡ chỉ nhận về lỗi.
     *
     * Việc này không mở popup: CIP-30 quy định ví ghi nhớ dApp đã được cấp quyền, nên
     * `enable()` trả về ngay. Nếu người dùng đã thu hồi quyền trong extension thì popup có
     * hiện — và đó cũng là lúc `silent` phát huy tác dụng.
     */
    const meta = installed.find((wallet) => wallet.id === savedId);
    if (meta === undefined) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }

    void connectTo(meta, true);
  }, [installed, connectTo]);

  const connect = useCallback(
    (id: string) => {
      const meta = installed?.find((wallet) => wallet.id === id);
      if (meta === undefined) {
        setError({ code: 'missing', detail: null });
        return;
      }
      void connectTo(meta, false);
    },
    [installed, connectTo],
  );

  /**
   * Ngắt kết nối — chỉ ở PHÍA ỨNG DỤNG.
   *
   * CIP-30 không có `disconnect()`. Quyền mà người dùng đã cấp nằm trong extension, nên sau
   * lệnh này ví vẫn coi trang web là đã được phép và lần bấm "Kết nối" sau sẽ không hỏi lại.
   * Muốn thu hồi thật thì phải làm trong chính extension. Nói rõ ở đây để sau này không ai
   * đọc nhầm hàm này thành một phép thu hồi quyền.
   */
  const disconnect = useCallback(() => {
    setConnected(null);
    setError(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  /** Đọc lại số dư và mạng — số dư đổi sau khi nhận faucet mà trang thì không tự biết. */
  const refresh = useCallback(() => {
    if (connected === null) return;
    void connectTo(connected, false);
  }, [connected, connectTo]);

  return { installed, connected, pendingId, error, connect, disconnect, refresh };
}
