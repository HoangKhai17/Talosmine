'use client';

import { useState } from 'react';
import { type ConnectedWallet, formatAda, isMainnet, shortenAddress } from './cardano-wallet';
import { SendAda, type SendAdaLabels } from './send-ada';
import { type CardanoWalletState, useCardanoWallet, type WalletError } from './use-cardano-wallet';
import styles from './wallet-connect.module.css';

/**
 * Khối kết nối ví — toàn bộ phần chạy ở trình duyệt của trang `/wallet`.
 *
 * Nạp qua `dynamic(..., { ssr: false })`, nên nó không bao giờ được render ở server. Đừng
 * biến file này thành import tĩnh của một Server Component: `@meshsdk/core` đọc `window`
 * ngay khi nạp module, và lỗi sẽ nổ ra ở BƯỚC BUILD chứ không phải lúc chạy.
 *
 * MỌI CHỮ ĐI QUA `labels`, không gõ thẳng vào JSX. Component này nằm dưới ranh giới
 * `ssr: false` nên không gọi được `resolvePageI18n`; chuỗi phải do Server Component cha đọc
 * từ catalog rồi truyền xuống. Thêm chữ mới thì thêm vào `WalletLabels` và cả hai catalog —
 * `satisfies Messages` ở `en.ts` sẽ báo lỗi biên dịch nếu quên một bên.
 *
 * Export MẶC ĐỊNH — khác thói quen export tên của repo — vì `next/dynamic` nhận thẳng module.
 */
export type WalletLabels = {
  searching: string;
  noWallet: string;
  connect: string;
  connecting: string;
  disconnect: string;
  balance: string;
  receiveAddress: string;
  fullAddress: string;
  copy: string;
  copied: string;
  refresh: string;
  refreshing: string;
  mainnetWarning: string;
  errDeclinedConnect: string;
  errStale: string;
  errStaleReload: string;
  errMissing: string;
  errUnknown: string;
} & SendAdaLabels;

export default function WalletConnect({ labels }: { labels: WalletLabels }) {
  const { installed, connected, pendingId, error, connect, disconnect, refresh } =
    useCardanoWallet();

  return (
    <div className={styles.panel}>
      {/*
        `aria-live` để trình đọc màn hình biết kết quả: mọi thay đổi ở đây bắt nguồn từ một
        cửa sổ NGOÀI trang (popup của extension), nên không có chuyển focus nào báo hiệu.
      */}
      <div className={styles.liveRegion} aria-live="polite">
        {connected === null ? (
          <WalletPicker
            labels={labels}
            installed={installed}
            pendingId={pendingId}
            onConnect={connect}
          />
        ) : (
          <WalletSummary
            labels={labels}
            wallet={connected}
            busy={pendingId !== null}
            onRefresh={refresh}
            onDisconnect={disconnect}
          />
        )}
      </div>

      {/*
        Ô gửi ADA chỉ xuất hiện khi ĐÃ kết nối. Bản thân `SendAda` còn tự trả `null` nếu ví
        đang ở mainnet — hai lớp, vì một chốt chặn chỉ nằm ở nơi gọi là chốt dễ mất khi thêm
        nơi gọi mới.
      */}
      {connected !== null && <SendAda labels={labels} wallet={connected} onSent={refresh} />}

      {error !== null && <WalletErrorNotice labels={labels} error={error} />}
    </div>
  );
}

/**
 * Dịch mã lỗi thành câu người đọc hiểu, và với `stale` thì kèm luôn CÁCH THOÁT.
 *
 * `stale` là loại lỗi mà bấm lại nút không bao giờ khỏi — kênh nối tới extension đã đóng, chỉ
 * tải lại trang mới lấy được đối tượng mới (xem `classify()` trong hook). Một thông báo không
 * kèm nút tải lại sẽ đẩy người dùng vào vòng bấm đi bấm lại, nên nút nằm ngay trong thông báo.
 */
function WalletErrorNotice({ labels, error }: { labels: WalletLabels; error: WalletError }) {
  const text: Record<WalletError['code'], string> = {
    declined: labels.errDeclinedConnect,
    stale: labels.errStale,
    missing: labels.errMissing,
    unknown: labels.errUnknown,
  };

  return (
    <div className={styles.error} role="alert">
      <p className="typeBodySmall">{text[error.code]}</p>

      {/* Chuỗi thô chỉ hiện cho lỗi chưa phân loại — nó là manh mối duy nhất để lần ra sau này. */}
      {error.detail !== null && (
        <p className={`typeCaption ${styles.errorDetail}`}>{error.detail}</p>
      )}

      {error.code === 'stale' && (
        <button
          type="button"
          className={`typeBodySmall ${styles.errorAction}`}
          onClick={() => window.location.reload()}
        >
          {labels.errStaleReload}
        </button>
      )}
    </div>
  );
}

/** Danh sách ví đã cài — hoặc lời hướng dẫn khi chưa có ví nào. */
function WalletPicker({
  labels,
  installed,
  pendingId,
  onConnect,
}: {
  labels: WalletLabels;
  installed: CardanoWalletState['installed'];
  pendingId: string | null;
  onConnect: (id: string) => void;
}) {
  if (installed === null) {
    return <p className={`typeBodySmall textSecondary ${styles.status}`}>{labels.searching}</p>;
  }

  if (installed.length === 0) {
    return (
      <div className={styles.empty}>
        <p className="typeBody">{labels.noWallet}</p>
        <p className={`typeBodySmall textSecondary ${styles.emptyHint}`}>
          Cài một ví hỗ trợ CIP-30 (Lace, Eternl, Nami, Yoroi, Typhon…), chuyển nó sang mạng{' '}
          <strong>Preprod</strong>, rồi tải lại trang.
        </p>
      </div>
    );
  }

  return (
    <ul className={styles.walletList}>
      {installed.map((wallet) => (
        <li key={wallet.id}>
          <button
            type="button"
            className={styles.walletButton}
            onClick={() => onConnect(wallet.id)}
            // Khoá CẢ danh sách khi đang chờ một ví: popup của extension là modal, bấm ví
            // thứ hai lúc đó chỉ tạo ra hai yêu cầu chồng nhau.
            disabled={pendingId !== null}
          >
            <WalletIcon icon={wallet.icon} />
            <span className={styles.walletMeta}>
              <span className="typeBody">{wallet.name}</span>
              <span className={`typeCaption textTertiary ${styles.walletVersion}`}>
                CIP-30 v{wallet.version}
              </span>
            </span>
            <span className={`typeBodySmall ${styles.walletAction}`}>
              {pendingId === wallet.id ? labels.connecting : labels.connect}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Thông tin ví đang kết nối — hoặc chốt chặn mainnet, tuỳ `networkId`. */
function WalletSummary({
  labels,
  wallet,
  busy,
  onRefresh,
  onDisconnect,
}: {
  labels: WalletLabels;
  wallet: ConnectedWallet;
  busy: boolean;
  onRefresh: () => void;
  onDisconnect: () => void;
}) {
  const onMainnet = isMainnet(wallet.networkId);

  return (
    <div className={styles.summary}>
      <div className={styles.identity}>
        <WalletIcon icon={wallet.icon} />
        <span className="typeCardTitle">{wallet.name}</span>
        <span className={`typeCaption ${onMainnet ? styles.badgeBlocked : styles.badge}`}>
          {onMainnet ? 'Mainnet' : 'Testnet'}
        </span>
      </div>

      {onMainnet ? (
        <MainnetGate labels={labels} />
      ) : (
        <WalletFacts labels={labels} wallet={wallet} />
      )}

      <div className={styles.actions}>
        {/*
          Ở mainnet nút "đọc lại" bị BỎ HẲN chứ không phải làm mờ: chốt chặn nói không cho
          thao tác, mà một nút xám vẫn mời người ta bấm thử.
        */}
        {!onMainnet && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onRefresh}
            disabled={busy}
          >
            {busy ? labels.refreshing : labels.refresh}
          </button>
        )}
        <button type="button" className={styles.secondaryButton} onClick={onDisconnect}>
          Ngắt kết nối
        </button>
      </div>
    </div>
  );
}

/**
 * Chốt chặn mainnet.
 *
 * KHÔNG hiện địa chỉ lẫn số dư ở đây — cố ý. Đây là bản demo testnet; ví mainnet lỡ kết nối
 * vào thì việc cần làm là đưa người dùng ra khỏi tình huống đó, không phải bày số dư thật
 * của họ lên một trang demo.
 */
function MainnetGate({ labels }: { labels: WalletLabels }) {
  return (
    <div className={styles.gate}>
      <p className="typeBody">{labels.mainnetWarning}</p>
      <p className={`typeBodySmall ${styles.gateHint}`}>
        Mở extension, chuyển mạng sang <strong>Preprod</strong>, rồi kết nối lại. Trong lúc đó trang
        không đọc địa chỉ và số dư của bạn.
      </p>
    </div>
  );
}

function WalletFacts({ labels, wallet }: { labels: WalletLabels; wallet: ConnectedWallet }) {
  return (
    <>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className="typeCaption textTertiary">{labels.receiveAddress}</dt>
          <dd className={styles.addressRow}>
            <code className={styles.address} title={wallet.address}>
              {shortenAddress(wallet.address)}
            </code>
            <CopyButton labels={labels} value={wallet.address} />
          </dd>
        </div>

        <div className={styles.fact}>
          <dt className="typeCaption textTertiary">{labels.balance}</dt>
          <dd className="typeBody">
            {formatAda(wallet.lovelace)} <span className="textSecondary">tADA</span>
          </dd>
        </div>

        <div className={styles.fact}>
          <dt className="typeCaption textTertiary">networkId</dt>
          <dd className="typeBody">{wallet.networkId} — testnet</dd>
        </div>
      </dl>

      {/*
        Nói thẳng giới hạn thay vì dán nhãn "Preprod" cho chắc: CIP-30 không phân biệt được
        Preprod với Preview. Xem ghi chú ở hằng `MAINNET_ID` trong `cardano-wallet.ts`.
      */}
      <p className={`typeCaption textTertiary ${styles.note}`}>
        CIP-30 chỉ cho biết testnet hay mainnet, không cho biết Preprod hay Preview. Hãy tự kiểm ví
        đang ở Preprod.
      </p>
    </>
  );
}

/**
 * Icon do chính extension cung cấp, luôn là data URI.
 *
 * Dùng `<img>` chứ không phải `next/image`: image optimizer không làm được gì với data URI
 * ngoài việc bắt khai `remotePatterns` — mà DEC-T12 nói rõ đó là quyết định cần record riêng.
 * `alt=""` vì tên ví đã nằm ngay bên cạnh; đọc lại lần nữa chỉ làm nhiễu.
 */
function WalletIcon({ icon }: { icon: string }) {
  // biome-ignore lint/performance/noImgElement: data URI từ extension, next/image không tối ưu được
  return <img className={styles.walletIcon} src={icon} alt="" width={28} height={28} />;
}

/** Nút chép địa chỉ. Địa chỉ bech32 đầy đủ dài trên 100 ký tự — không ai chép tay được. */
function CopyButton({ labels, value }: { labels: WalletLabels; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={styles.copyButton}
      onClick={() => {
        // `navigator.clipboard` chỉ tồn tại trong ngữ cảnh bảo mật (https hoặc localhost).
        // Ngoài hai chỗ đó nó ném — và một nút chép hỏng không đáng làm vỡ cả trang.
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => setCopied(false));
      }}
    >
      <span className="typeCaption">{copied ? labels.copied : labels.copy}</span>
      <span className="visuallyHidden">{labels.fullAddress}</span>
    </button>
  );
}
