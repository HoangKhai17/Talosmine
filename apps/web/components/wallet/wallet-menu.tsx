'use client';

import { useEffect, useRef } from 'react';
import { formatAda, isMainnet, shortenAddress } from './cardano-wallet';
import { useCardanoWallet } from './use-cardano-wallet';
import styles from './wallet-menu.module.css';

/**
 * Nút "Kết nối ví" ở header + hộp thoại chọn ví.
 *
 * VÌ SAO LÀ HỘP THOẠI CHỨ KHÔNG PHẢI MỘT TRANG: kết nối ví là một hành động, không phải một
 * đích đến. Bắt người dùng rời trang đang xem để bấm một nút rồi tự tìm đường quay lại là
 * đánh mất ngữ cảnh họ đang có. Trang `/wallet` vẫn còn — nó giữ phần gửi ADA — nhưng lối
 * vào chính giờ nằm ngay ở header.
 *
 * DÙNG `<dialog>` GỐC, không tự dựng lớp phủ bằng `div`. Trình duyệt cho sẵn: phím Esc đóng,
 * focus bị giữ trong hộp thoại, phần nền bị `inert` nên trình đọc màn hình không đọc xuyên
 * qua, và `::backdrop` là lớp nền thật. Tự dựng lại từng thứ đó bằng tay là chỗ mà mọi modal
 * viết tay đều sai ít nhất một điểm.
 *
 * PHẢI NẠP QUA `dynamic(..., { ssr: false })`. `useCardanoWallet` kéo theo `@meshsdk/core`,
 * gói này đọc `window` NGAY KHI NẠP MODULE — render ở server là hỏng ở bước build, không
 * phải lúc chạy. Xem chỗ gọi trong `header-nav.tsx`.
 */

export interface WalletMenuLabels {
  /** Nhãn nút khi chưa kết nối. */
  menuConnect: string;
  menuDialogTitle: string;
  menuClose: string;
  /** Link sang `/wallet` — nơi có phần gửi ADA. */
  menuManage: string;
  searching: string;
  noWallet: string;
  connect: string;
  connecting: string;
  disconnect: string;
  balance: string;
  receiveAddress: string;
  mainnetWarning: string;
  errDeclinedConnect: string;
  errStale: string;
  errStaleReload: string;
  errMissing: string;
  errUnknown: string;
}

export default function WalletMenu({
  labels,
  walletHref,
}: {
  labels: WalletMenuLabels;
  walletHref: string;
}) {
  const { installed, connected, pendingId, error, connect, disconnect } = useCardanoWallet();
  const dialogRef = useRef<HTMLDialogElement>(null);

  /**
   * Đóng hộp thoại ngay khi kết nối xong.
   *
   * Nếu không, người dùng bấm ví → cấp quyền trong extension → quay lại thấy hộp thoại vẫn
   * mở y như cũ, và phải tự đoán rằng nó đã xong. Đóng lại là câu trả lời rõ ràng nhất; nút
   * ở header đổi sang địa chỉ ví là phần xác nhận.
   */
  useEffect(() => {
    if (connected !== null) dialogRef.current?.close();
  }, [connected]);

  return (
    <>
      <button
        type="button"
        className={`typeBody ${styles.trigger}`}
        onClick={() => dialogRef.current?.showModal()}
      >
        {connected === null ? (
          labels.menuConnect
        ) : (
          <>
            <WalletIcon className={styles.triggerIcon} icon={connected.icon} />
            <span>{shortenAddress(connected.address)}</span>
          </>
        )}
      </button>

      {/*
        `onClick` trên chính `<dialog>` xử lý việc bấm ra ngoài để đóng: khi hộp thoại mở bằng
        `showModal()`, vùng nền (`::backdrop`) tính là chính phần tử `<dialog>`, còn nội dung
        nằm trong `.dialogBody`. So sánh `event.target` với `dialogRef` phân biệt được hai
        vùng đó mà không cần thêm lớp `div` phủ nào.
      */}
      {/*
        biome-ignore lint/a11y/useKeyWithClickEvents: `<dialog>` mở bằng `showModal()` đã có
        sẵn phím Esc để đóng, do trình duyệt cài đặt. `onClick` ở đây chỉ thêm lối đóng bằng
        chuột (bấm ra nền); thêm `onKeyDown` sẽ là một đường tắt bàn phím TRÙNG với Esc.
      */}
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className={styles.dialogBody}>
          <div className={styles.dialogHead}>
            <h2 className="typeCardTitle">{labels.menuDialogTitle}</h2>
            <button
              type="button"
              className={styles.close}
              aria-label={labels.menuClose}
              onClick={() => dialogRef.current?.close()}
            >
              ✕
            </button>
          </div>

          {connected === null ? (
            <WalletPicker
              labels={labels}
              installed={installed}
              pendingId={pendingId}
              onConnect={connect}
            />
          ) : (
            <div className={styles.summary}>
              <div className={styles.summaryHead}>
                <WalletIcon className={styles.walletIcon} icon={connected.icon} />
                <span className="typeBody">{connected.name}</span>
              </div>

              {isMainnet(connected.networkId) && (
                <p className={`typeBodySmall ${styles.warning}`}>{labels.mainnetWarning}</p>
              )}

              <dl className={styles.facts}>
                <dt className="typeCaption textSecondary">{labels.receiveAddress}</dt>
                {/* `break-all` ở CSS: địa chỉ Cardano dài ~100 ký tự, không có chỗ ngắt dòng tự nhiên. */}
                <dd className={`typeBodySmall ${styles.address}`}>{connected.address}</dd>

                <dt className="typeCaption textSecondary">{labels.balance}</dt>
                <dd className="typeBodySmall">
                  {connected.lovelace === null ? '—' : `${formatAda(connected.lovelace)} ADA`}
                </dd>
              </dl>

              <div className={styles.summaryActions}>
                <a className={`typeBodySmall ${styles.manageLink}`} href={walletHref}>
                  {labels.menuManage}
                </a>
                <button
                  type="button"
                  className={`typeBodySmall ${styles.secondaryButton}`}
                  onClick={disconnect}
                >
                  {labels.disconnect}
                </button>
              </div>
            </div>
          )}

          {error !== null && (
            <div className={styles.error} role="alert">
              <p className="typeBodySmall">
                {
                  {
                    declined: labels.errDeclinedConnect,
                    stale: labels.errStale,
                    missing: labels.errMissing,
                    unknown: labels.errUnknown,
                  }[error.code]
                }
              </p>

              {error.detail !== null && (
                <p className={`typeCaption ${styles.errorDetail}`}>{error.detail}</p>
              )}

              {/* Kênh nối tới extension đã chết — bấm lại vô ích, chỉ tải lại trang mới cứu được. */}
              {error.code === 'stale' && (
                <button
                  type="button"
                  className={`typeBodySmall ${styles.secondaryButton}`}
                  onClick={() => window.location.reload()}
                >
                  {labels.errStaleReload}
                </button>
              )}
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

/** Danh sách ví đã cài — hoặc lời giải thích khi chưa quét xong / không có ví nào. */
function WalletPicker({
  labels,
  installed,
  pendingId,
  onConnect,
}: {
  labels: WalletMenuLabels;
  installed: ReturnType<typeof useCardanoWallet>['installed'];
  pendingId: string | null;
  onConnect: (id: string) => void;
}) {
  // `null` = CHƯA quét xong, khác hẳn mảng rỗng = quét xong và thật sự không có ví nào.
  // Gộp hai trạng thái này lại sẽ báo "chưa cài ví" cho người vừa mở trang mà ví vẫn đang nạp.
  if (installed === null) {
    return <p className="typeBodySmall textSecondary">{labels.searching}</p>;
  }

  if (installed.length === 0) {
    return <p className="typeBodySmall textSecondary">{labels.noWallet}</p>;
  }

  return (
    <ul className={styles.walletList}>
      {installed.map((wallet) => (
        <li key={wallet.id}>
          <button
            type="button"
            className={`typeBody ${styles.walletOption}`}
            onClick={() => onConnect(wallet.id)}
            disabled={pendingId !== null}
          >
            <WalletIcon className={styles.walletIcon} icon={wallet.icon} />
            <span className={styles.walletName}>{wallet.name}</span>
            <span className="typeCaption textSecondary">
              {pendingId === wallet.id ? labels.connecting : labels.connect}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Icon ví do chính extension cung cấp.
 *
 * DÙNG `<img>` CHỨ KHÔNG PHẢI `next/image`: giá trị là data URI, mà image optimizer của Next
 * không làm được gì với nó — nó chỉ thêm một vòng qua `/_next/image` rồi trả lại đúng thứ đã
 * có sẵn trong HTML. `width`/`height` khai cứng để khung không nhảy trước khi CSS áp vào.
 */
// `className: string | undefined` chứ KHÔNG phải `className?:`. Repo bật
// `exactOptionalPropertyTypes`, nên hai cách viết đó khác nhau: dấu `?` nghĩa là "được phép
// vắng mặt", còn kiểu sinh cho CSS Module trả về một giá trị CÓ MẶT nhưng có thể `undefined`.
function WalletIcon({ className, icon }: { className: string | undefined; icon: string }) {
  // biome-ignore lint/performance/noImgElement: data URI từ extension, next/image không tối ưu được
  return <img className={className} src={icon} alt="" width={28} height={28} />;
}
