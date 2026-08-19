'use client';

import { useState } from 'react';
import { type ConnectedWallet, isMainnet } from './cardano-wallet';
import styles from './wallet-connect.module.css';

export interface SendAdaLabels {
  sendTitle: string;
  sendLead: string;
  sendRecipient: string;
  sendRecipientPlaceholder: string;
  sendAmount: string;
  sendSubmit: string;
  sendSubmitting: string;
  sendSuccess: string;
  sendViewOnExplorer: string;
  errAddressEmpty: string;
  errAddressNetwork: string;
  errAmountInvalid: string;
  errAmountMin: string;
  errAmountBalance: string;
  errDeclined: string;
  errSendStale: string;
  errSendFailed: string;
}

/** Cardano bắt mỗi output tối thiểu ~1 ADA (min-ADA). Dưới mức đó node từ chối thẳng. */
const MIN_LOVELACE = 1_000_000n;

/**
 * Gửi ADA trên mạng thử nghiệm — dựng, ký và phát HOÀN TOÀN Ở TRÌNH DUYỆT.
 *
 * VÌ SAO KHÔNG QUA BACKEND: cổng thanh toán đầy đủ (đơn hàng, đối chiếu on-chain, webhook) cần
 * Postgres, Redis, Blockfrost và một watcher — nằm ngoài phạm vi bản demo. Nhưng "chứng minh
 * giao dịch chạy thật" thì không cần bất kỳ thứ nào trong số đó: ví tự dựng, tự ký, tự phát
 * lên mạng. Người xem hồ sơ bấm nút, ví bật lên, và giao dịch xuất hiện trên Cardanoscan.
 *
 * KHUÔN LẤY TỪ `SendAdaCard.tsx` của repo `ADA-BAMBOO/Connect-Wallet-Cardano`: validate →
 * `new Transaction({ initiator })` → `sendLovelace` → `build` → `signTx` → `submitTx`.
 *
 * HAI KHÁC BIỆT SO VỚI REPO GỐC, đều có lý do:
 *
 * 1. Repo gốc dùng `useWallet()` của `@meshsdk/react` nên có sẵn instance ví. Hook của ta trả
 *    về DỮ LIỆU THUẦN (không giữ instance), nên ở đây phải `BrowserWallet.enable(id)` lại.
 *    Không phiền người dùng: ví đã cấp quyền thì lần gọi sau trả về ngay, không hỏi lại.
 *
 * 2. `Transaction` được `import()` ĐỘNG, không nhập ở đầu file. Nó kéo theo phần dựng giao
 *    dịch khá nặng của Mesh; nhập tĩnh là ai mở trang ví cũng phải tải, kể cả người chỉ xem
 *    số dư.
 */
export function SendAda({
  labels,
  wallet,
  onSent,
}: {
  labels: SendAdaLabels;
  wallet: ConnectedWallet;
  /** Báo cho trang cha đọc lại số dư sau khi giao dịch được phát. */
  onSent: () => void;
}) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Chặn cứng: bản demo chỉ chạy testnet. Component này không được render ở mainnet, nhưng
  // kiểm lại ở đây vì một chốt chặn chỉ ở nơi gọi là chốt chặn dễ bị quên khi thêm nơi gọi mới.
  if (isMainnet(wallet.networkId)) return null;

  /**
   * Đổi chuỗi ADA người dùng gõ sang lovelace.
   *
   * KHÔNG dùng `Number` rồi nhân 1e6: số thực nhị phân làm tròn sai ở chữ số thập phân thứ sáu,
   * và đây là tiền. Cắt chuỗi rồi ghép bằng `BigInt` thì không mất mát gì.
   */
  function toLovelace(input: string): bigint | null {
    const text = input.trim();
    if (!/^\d+(\.\d{1,6})?$/.test(text)) return null;
    const [whole, fraction = ''] = text.split('.');
    return BigInt(whole ?? '0') * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  }

  function validate(): string | null {
    const to = recipient.trim();
    if (to === '') return labels.errAddressEmpty;

    // Địa chỉ testnet bắt đầu bằng `addr_test`, mainnet bằng `addr1`. Gửi nhầm mạng thì giao
    // dịch bị từ chối ở bước phát — bắt sớm ở đây cho thông điệp dễ hiểu hơn nhiều.
    if (!to.startsWith('addr_test')) return labels.errAddressNetwork;

    const lovelace = toLovelace(amount);
    if (lovelace === null) return labels.errAmountInvalid;
    if (lovelace < MIN_LOVELACE) return labels.errAmountMin;
    if (wallet.lovelace !== null && lovelace > BigInt(wallet.lovelace)) {
      return labels.errAmountBalance;
    }
    return null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setTxHash(null);

    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }

    setBusy(true);
    try {
      // Nhập động: xem ghi chú số 2 ở đầu file.
      const { BrowserWallet, Transaction } = await import('@meshsdk/core');
      const instance = await BrowserWallet.enable(wallet.id);

      const tx = new Transaction({ initiator: instance });
      tx.sendLovelace(recipient.trim(), String(toLovelace(amount)));

      const unsigned = await tx.build();
      const signed = await instance.signTx(unsigned);
      const hash = await instance.submitTx(signed);

      setTxHash(hash);
      setAmount('');
      onSent();
    } catch (cause) {
      const raw = cause instanceof Error ? cause.message : String(cause);

      // Kênh nối tới extension đã chết (`RemoteApiShutdownError` của Lace và tương đương ở ví
      // khác). `BrowserWallet.enable()` ở đầu hàm là chỗ hay dính nhất, vì trang có thể đã mở
      // hàng chục phút trước khi người dùng bấm gửi — thừa thời gian để service worker của
      // extension ngủ. Bấm lại không khỏi; phải tải lại trang. Xem `classify()` trong hook.
      if (/shutdown|no longer be used|remoteapi|disconnected port/i.test(raw)) {
        setError(labels.errSendStale);
        return;
      }

      // Người dùng bấm "Huỷ" trong ví KHÔNG phải lỗi hệ thống — nói đúng chuyện đã xảy ra
      // thay vì một thông báo thất bại chung chung khiến họ tưởng có gì hỏng.
      const declined = /declin|reject|cancel|user denied/i.test(raw);
      setError(declined ? labels.errDeclined : labels.errSendFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.sendCard} onSubmit={(e) => void submit(e)} noValidate>
      <h2 className="typeCardTitle">{labels.sendTitle}</h2>
      <p className={`typeBodySmall textSecondary ${styles.sendLead}`}>{labels.sendLead}</p>

      <label className={`typeBodySmall ${styles.sendField}`}>
        {labels.sendRecipient}
        <input
          className={`typeBody ${styles.sendInput}`}
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder={labels.sendRecipientPlaceholder}
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <label className={`typeBodySmall ${styles.sendField}`}>
        {labels.sendAmount}
        <input
          className={`typeBody ${styles.sendInput}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="1.5"
          autoComplete="off"
        />
      </label>

      {error ? (
        <p className={`typeBodySmall ${styles.sendError}`} role="alert">
          {error}
        </p>
      ) : null}

      {txHash ? (
        <p className={`typeBodySmall ${styles.sendOk}`}>
          {labels.sendSuccess}{' '}
          <a
            href={`https://preprod.cardanoscan.io/transaction/${txHash}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {labels.sendViewOnExplorer}
          </a>
        </p>
      ) : null}

      <button type="submit" className={`typeBody ${styles.sendSubmit}`} disabled={busy}>
        {busy ? labels.sendSubmitting : labels.sendSubmit}
      </button>
    </form>
  );
}
