/**
 * Phần THUẦN của kết nối ví: kiểu dữ liệu và mấy hàm định dạng.
 *
 * Tách khỏi hook và khỏi React có chủ đích — file này không import `@meshsdk/core`, nên nó
 * chạy được ở bất cứ đâu (kể cả server) và test được mà không cần trình duyệt. Mọi thứ chạm
 * vào `window.cardano` nằm ở `use-cardano-wallet.ts`.
 */

/** Một ví đã cài, đúng hình dạng `Wallet` mà Mesh trả về từ `getInstalledWallets()`. */
export interface InstalledWallet {
  /**
   * KHOÁ trong `window.cardano` — đây mới là thứ truyền cho `BrowserWallet.enable()`.
   *
   * Không phải `name`. Với phần lớn ví hai giá trị này trùng nhau, nên nhầm chúng vẫn chạy
   * và chỉ vỡ ở đúng những ví có khoá khác tên hiển thị (Mesh đổi `nufiSnap` → "MetaMask").
   * Đó là loại lỗi chỉ lộ ra trên máy người khác.
   */
  id: string;
  name: string;
  /** Data URI do chính extension cung cấp — vì vậy `img-src` cần `data:`, vốn đã có sẵn. */
  icon: string;
  version: string;
}

/** Thông tin đọc được sau khi người dùng bấm đồng ý trong extension. */
export interface ConnectedWallet {
  id: string;
  name: string;
  icon: string;
  /** Địa chỉ nhận tiền thừa (bech32). Dùng nó vì ví mới tinh chưa có địa chỉ đã dùng nào. */
  address: string;
  /** CIP-30: 0 = testnet, 1 = mainnet. Không có giá trị nào khác. */
  networkId: number;
  /**
   * Số dư tính bằng lovelace, hoặc `null` khi không đọc được.
   *
   * `null` KHÔNG phải lỗi kết nối: giải mã CBOR số dư là bước riêng và có ví trả về dạng
   * Mesh chưa xử lý được. Kết nối vẫn thành công, chỉ ô số dư hiện dấu gạch.
   */
  lovelace: string | null;
}

/**
 * CIP-30 chỉ phân biệt được testnet với mainnet — `networkId` là một bit, không phải tên
 * mạng. Preprod và Preview cùng trả về 0, và địa chỉ hai mạng đều mang tiền tố `addr_test`.
 *
 * Nói cách khác: từ phía trình duyệt KHÔNG có cách nào khẳng định người dùng đang ở Preprod
 * chứ không phải Preview. Muốn chắc thì phải hỏi một node/indexer (Blockfrost) — việc đó
 * nằm ngoài phạm vi hôm nay. Nên giao diện nói đúng thứ mình biết: "testnet", kèm nhắc chọn
 * Preprod, thay vì khẳng định một điều chưa kiểm được.
 */
export const MAINNET_ID = 1;

export function isMainnet(networkId: number): boolean {
  return networkId === MAINNET_ID;
}

/**
 * Rút gọn địa chỉ bech32 để nó nằm gọn một dòng.
 *
 * Giữ đầu và đuôi vì đó là hai phần người ta thật sự đối chiếu khi so với màn hình ví.
 * Địa chỉ ngắn hơn ngưỡng thì trả nguyên văn — cắt nó chỉ làm mất thông tin mà không tiết
 * kiệm được chỗ nào.
 */
export function shortenAddress(address: string, head = 12, tail = 8): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/**
 * lovelace → chuỗi ADA theo cách viết số tiếng Việt (`1.234,56`).
 *
 * Dùng `BigInt` chứ không phải `Number`: số dư tính bằng lovelace vượt `Number.MAX_SAFE_INTEGER`
 * ở khoảng 9 tỉ ADA. Con số đó lớn hơn tổng cung thật, nên trên mainnet sẽ không bao giờ
 * chạm tới — nhưng ví testnet nhận faucet nhiều lần thì không có trần nào cả, và một số dư
 * hiện sai vài lovelace là thứ rất khó tin tưởng.
 *
 * Không dùng `Intl.NumberFormat`: nó định dạng theo locale của TRÌNH DUYỆT, nên cùng một
 * trang sẽ hiện `1,234.56` trên máy đặt tiếng Anh — lệch với phần chữ tiếng Việt quanh nó.
 */
export function formatAda(lovelace: string | null): string {
  if (lovelace === null) return '—';

  let value: bigint;
  try {
    value = BigInt(lovelace);
  } catch {
    // Ví trả về thứ không phải số nguyên: hiện gạch ngang, đừng hiện `NaN`.
    return '—';
  }

  const negative = value < 0n;
  if (negative) value = -value;

  const whole = (value / 1_000_000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  // Luôn giữ ít nhất hai chữ số thập phân để cột số không nhảy độ dài khi số dư đổi.
  const fraction = (value % 1_000_000n)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '')
    .padEnd(2, '0');

  return `${negative ? '-' : ''}${whole},${fraction}`;
}
