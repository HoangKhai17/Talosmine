import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { localeHref } from '../../../i18n/locale';
import { type PageLocaleParams, resolvePageI18n } from '../../../i18n/params';
import { BRAND_NAME } from '../../../lib/brand';
import { getBrandLogoSrc } from '../../../server/brand-logo';
import { readServerEnv } from '../../../server/env';
import { safeReturnTo } from '../../../server/oidc';
import { readOnboarding } from '../../../server/onboarding';
import styles from './page.module.css';
import { SurveyForm } from './survey-form';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { t } = await resolvePageI18n(params);
  return {
    title: `${BRAND_NAME} — ${t.onboarding.title}`,
    // Màn hình riêng tư của một người dùng cụ thể, không có gì để index.
    robots: { index: false, follow: false },
  };
}

/**
 * Khảo sát onboarding sau khi đăng ký.
 *
 * SHELL RIÊNG, không dùng `(user)` layout: màn hình này cố ý không có menu chính và footer.
 * Đưa người vừa đăng ký vào một trang đầy link điều hướng là mời họ đi chỗ khác trước khi
 * trả lời. Đây cùng lập luận với `/auth` — xem `auth-shell.tsx`.
 *
 * ĐỌC Ở SERVER: người dùng thấy nội dung ngay ở lần vẽ đầu, không phải khung trống rồi nhảy.
 *
 * KHÔNG BẮT BUỘC: nút "Bỏ qua" luôn dùng được, và ai đã trả lời rồi mà mở lại URL này sẽ bị
 * chuyển thẳng về trang chủ — không có cách nào bị kẹt ở đây.
 */
export default async function OnboardingPage({
  params,
  searchParams,
}: PageLocaleParams & { searchParams: Promise<{ returnTo?: string }> }) {
  const { locale, t } = await resolvePageI18n(params);
  const { returnTo } = await searchParams;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('__Host-talos_session')?.value;

  const home = localeHref(locale, '/');
  const appBaseUrl = readServerEnv().APP_BASE_URL;
  const safeDestination =
    appBaseUrl && returnTo !== undefined ? safeReturnTo(returnTo, appBaseUrl) : home;
  const doneHref = safeDestination === '/' ? home : safeDestination;
  const survey = await readOnboarding(sessionToken, locale);

  // Đã trả lời, đã bỏ qua, chưa đăng nhập, hoặc Control Plane không trả lời được — tiếp tục
  // tới đích nội bộ đã kiểm tra (hoặc trang chủ theo locale). Không ai kẹt lại ở màn hình này.
  if (!survey.required) redirect(doneHref);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href={home}>
            <Logo url={await getBrandLogoSrc()} />
          </Link>

          {/*
            Hệ thống chưa có trang hỗ trợ riêng; `/contact` là đích gần nhất và có thật.
            Đổi khi trang hỗ trợ ra đời.
          */}
          <Link className={`typeBodySmall ${styles.help}`} href={localeHref(locale, '/contact')}>
            {t.onboarding.needHelp}
          </Link>
        </div>
      </header>

      <main id="main" className={styles.main}>
        <div className={styles.intro}>
          <h1 className={`typeH2 ${styles.title}`}>{t.onboarding.title}</h1>
          <p className={`typeBody textSecondary ${styles.lead}`}>{t.onboarding.lead}</p>
          <p className={`typeBodySmall ${styles.duration}`}>{t.onboarding.duration}</p>
        </div>

        <SurveyForm
          questions={survey.questions}
          locale={locale}
          doneHref={doneHref}
          labels={{
            step: t.onboarding.step,
            progress: t.onboarding.progress,
            previous: t.onboarding.previous,
            next: t.onboarding.next,
            complete: t.onboarding.complete,
            submitting: t.onboarding.submitting,
            skip: t.onboarding.skip,
            submitFailed: t.onboarding.submitFailed,
            needMore: t.onboarding.needMore,
          }}
        />
      </main>
    </div>
  );
}

/** Cùng quy tắc với header của site — xem ghi chú ở `(user)/layout.tsx`. */
function Logo({ url }: { url: string | null }) {
  if (url === null) return <span className="typeCardTitle">KOLO</span>;

  // biome-ignore lint/performance/noImgElement: URL do admin nhập lúc chạy, next/image cần host khai trước.
  return <img className={styles.logoImage} src={url} alt="KOLO" />;
}
