import type { Metadata } from 'next';
import {
  localeAlternates,
  type PageLocaleParams,
  resolvePageI18n,
} from '../../../../../i18n/params';
import styles from '../shared.module.css';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t } = await resolvePageI18n(params);
  return {
    title: t.notificationsPage.title,
    alternates: localeAlternates(locale, '/account/notifications'),
    robots: { index: false, follow: false },
  };
}

/**
 * Tuỳ chọn thông báo.
 *
 * CHƯA CÓ BACKEND: không có bảng preferences, không có API, và cũng chưa có hạ tầng gửi thư
 * ngoài SMTP của Logto.
 *
 * MỌI CÔNG TẮC ĐỀU `disabled` — có chủ đích, và đây là điểm quan trọng nhất của trang này.
 * Một công tắc bật/tắt được nhưng không lưu là kiểu hỏng khó chịu nhất: người dùng tin là đã
 * đổi, tải lại trang thì mất, và không có thông báo lỗi nào để lần ra. `disabled` nói thật
 * ngay từ đầu.
 *
 * Trạng thái mặc định (`defaultChecked`) chỉ để thể hiện thiết kế; nó không đọc từ đâu cả.
 */
export default async function NotificationsPage({ params }: PageLocaleParams) {
  const { t } = await resolvePageI18n(params);
  const page = t.notificationsPage;

  const preferences = [
    {
      id: 'new-tools',
      title: page.newToolsTitle,
      lead: page.newToolsLead,
      on: true,
      badge: page.recommended,
    },
    { id: 'digest', title: page.digestTitle, lead: page.digestLead, on: true },
    { id: 'product', title: page.productTitle, lead: page.productLead, on: true },
    { id: 'tips', title: page.tipsTitle, lead: page.tipsLead, on: true },
    { id: 'marketing', title: page.marketingTitle, lead: page.marketingLead, on: false },
  ];

  return (
    <div>
      <div className={styles.header}>
        <h1 className="typeH2">{page.title}</h1>
        <p className={`typeBody ${styles.lead}`}>{page.lead}</p>
      </div>

      <section className={styles.card} aria-labelledby="prefs-heading">
        <h2 className="typeH3" id="prefs-heading">
          {page.preferences}
        </h2>

        <p className={`typeBodySmall ${styles.notReady}`} id="notif-not-ready">
          {page.notReady}
        </p>

        <div>
          {preferences.map((item) => (
            <div className={styles.row} key={item.id}>
              <div className={styles.rowText}>
                <label className={`typeBody ${styles.rowTitle}`} htmlFor={`notif-${item.id}`}>
                  {item.title}
                  {item.badge ? (
                    <span className={`typeCaption ${styles.badge}`}>{item.badge}</span>
                  ) : null}
                </label>
                <p className={`typeBodySmall ${styles.rowLead}`}>{item.lead}</p>
              </div>
              <input
                id={`notif-${item.id}`}
                type="checkbox"
                className={styles.switch}
                defaultChecked={item.on}
                disabled
                aria-describedby="notif-not-ready"
              />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.card} aria-labelledby="channels-heading">
        <h2 className="typeH3" id="channels-heading">
          {page.channels}
        </h2>

        <div>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <label className={`typeBody ${styles.rowTitle}`} htmlFor="channel-email">
                {page.channelEmail}
              </label>
              <p className={`typeBodySmall ${styles.rowLead}`}>{page.channelBrowserLead}</p>
            </div>
            <input
              id="channel-email"
              type="checkbox"
              className={styles.switch}
              defaultChecked
              disabled
              aria-describedby="notif-not-ready"
            />
          </div>

          <div className={styles.row}>
            <div className={styles.rowText}>
              <label className={`typeBody ${styles.rowTitle}`} htmlFor="channel-browser">
                {page.channelBrowser}
              </label>
              <p className={`typeBodySmall ${styles.rowLead}`}>{page.channelBrowserLead}</p>
            </div>
            <input
              id="channel-browser"
              type="checkbox"
              className={styles.switch}
              defaultChecked
              disabled
              aria-describedby="notif-not-ready"
            />
          </div>
        </div>

        {/*
          Câu này ĐÚNG kể cả sau khi phần trên chạy được: thư về bảo mật và tài khoản không
          nằm trong danh sách chọn được, vì tắt chúng là tự bịt mắt mình trước sự cố.
        */}
        <p className={`typeBodySmall ${styles.lead}`}>{page.alwaysOn}</p>
      </section>
    </div>
  );
}
