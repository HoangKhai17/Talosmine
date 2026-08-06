import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { localeHref } from '../../../../i18n/locale';
import { type PageLocaleParams, resolvePageI18n } from '../../../../i18n/params';
import type { SurveyQuestion } from '../../../../server/onboarding';
import styles from '../page.module.css';
import { SurveyForm } from '../survey-form';

/**
 * XEM TRƯỚC layout onboarding — CHỈ CHẠY Ở DEV.
 *
 * VẤN ĐỀ NÓ GIẢI: trang `/onboarding` thật chỉ hiện khi `survey.required === true`, tức chỉ
 * với tài khoản CHƯA trả lời khảo sát (`page.tsx`: `if (!survey.required) redirect(doneHref)`).
 * Bấm "Hoàn tất" hay "Bỏ qua" một lần là trang biến mất, phải xoá dòng trong
 * `survey_responses` mới xem lại được — vòng lặp quá chậm để chỉnh CSS.
 *
 * VÌ SAO XEM TRƯỚC Ở ĐÂY KHÔNG "NÓI DỐI":
 *   - Nhập `../page.module.css` — CÙNG file CSS với trang thật, không phải bản sao. Sửa CSS
 *     là cả hai đổi theo.
 *   - Nhập `../survey-form` — CÙNG component chứa toàn bộ phần khó (thẻ lựa chọn, thanh tiến
 *     độ, điều hướng bước, trạng thái lỗi).
 *   - Nhãn lấy từ CÙNG catalog i18n.
 * Chỉ phần vỏ ngoài (header + đoạn mở đầu) là chép lại — xem cảnh báo bên dưới.
 *
 * KHÔNG PHẢI CỬA HẬU: trang này không đọc phiên, không đọc database, không nhận dữ liệu từ
 * người dùng. Nó render hằng số. Kể cả khi lọt lên production nó cũng không lộ gì — nhưng
 * vẫn chặn bằng `notFound()` vì một trang lạ trong sản phẩm thật là thứ gây hoang mang.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * CẢNH BÁO GIỮ ĐỒNG BỘ: khối JSX vỏ ngoài dưới đây chép từ `../page.tsx`.
 *
 * Cố ý chưa tách thành component dùng chung vì trang thật đang được sửa; tách lúc này sẽ
 * đụng vào file đang mở. Khi layout chốt xong thì NÊN tách — nếu không, hai bản sẽ trôi xa
 * nhau và trang xem trước mất hết giá trị.
 *
 * Phần dễ trôi nhất là vỏ ngoài; phần nặng nhất (`SurveyForm` + CSS) thì dùng chung nên
 * không trôi được.
 */

/** Bộ câu hỏi giả lập theo ĐÚNG hình dạng dữ liệu thật (3 câu · 8/5/5 lựa chọn). */
const FIXTURE: SurveyQuestion[] = [
  {
    key: 'categories',
    kind: 'multi',
    minSelect: 3,
    title: 'Bạn quan tâm nhất tới nhóm AI nào?',
    description: null,
    options: [
      { key: 'writing', label: 'Viết lách', description: null, icon: 'writing' },
      { key: 'design', label: 'Thiết kế', description: null, icon: 'design' },
      { key: 'coding', label: 'Lập trình', description: null, icon: 'code' },
      { key: 'video', label: 'Video', description: null, icon: 'video' },
      { key: 'image', label: 'Hình ảnh', description: null, icon: 'image' },
      { key: 'automation', label: 'Tự động hoá', description: null, icon: 'automation' },
      { key: 'research', label: 'Nghiên cứu', description: null, icon: 'research' },
      { key: 'business', label: 'Kinh doanh', description: null, icon: 'business' },
    ],
  },
  {
    key: 'primary_use',
    kind: 'single',
    minSelect: 1,
    title: 'Bạn dùng AI chủ yếu để làm gì?',
    description: null,
    options: [
      { key: 'personal_productivity', label: 'Năng suất cá nhân', description: null, icon: null },
      { key: 'business_marketing', label: 'Kinh doanh & Marketing', description: null, icon: null },
      { key: 'learning_research', label: 'Học tập & Nghiên cứu', description: null, icon: null },
      { key: 'content_creation', label: 'Sáng tạo nội dung', description: null, icon: null },
      { key: 'software_development', label: 'Phát triển phần mềm', description: null, icon: null },
    ],
  },
  {
    key: 'discover_first',
    kind: 'single',
    minSelect: 1,
    title: 'Bạn muốn khám phá điều gì trước?',
    description: null,
    options: [
      { key: 'new_tools', label: 'Công cụ AI mới', description: null, icon: null },
      { key: 'expert_guides', label: 'Hướng dẫn chuyên sâu', description: null, icon: null },
      { key: 'tool_comparisons', label: 'So sánh công cụ', description: null, icon: null },
      { key: 'industry_news', label: 'Tin ngành', description: null, icon: null },
      { key: 'workflow_ideas', label: 'Ý tưởng quy trình', description: null, icon: null },
    ],
  },
];

/**
 * Biến thể `?variant=long` — nhãn dài và có mô tả.
 *
 * Chữ dài là thứ làm vỡ layout nhiều nhất, mà dữ liệu seed hiện toàn nhãn ngắn nên chỉnh
 * theo nó xong vẫn có thể vỡ khi admin đặt nhãn thật dài hơn.
 */
const FIXTURE_LONG: SurveyQuestion[] = [
  {
    key: 'categories',
    kind: 'multi',
    minSelect: 3,
    title:
      'Bạn quan tâm nhất tới nhóm công cụ trí tuệ nhân tạo nào trong công việc hằng ngày của mình?',
    description: 'Chọn ít nhất ba nhóm để chúng tôi gợi ý đúng thứ bạn cần ngay từ lần đầu.',
    options:
      FIXTURE[0]?.options.map((o) => ({
        ...o,
        label: `${o.label} và các công cụ liên quan tới lĩnh vực này`,
        description: 'Mô tả phụ dài hơn bình thường để thử xem thẻ có vỡ hay không.',
      })) ?? [],
  },
];

export default async function OnboardingPreviewPage({
  params,
  searchParams,
}: PageLocaleParams & { searchParams: Promise<{ variant?: string }> }) {
  // Chặn ở production. `notFound()` chứ không phải redirect: trang này không tồn tại trong
  // sản phẩm thật, và 404 là câu trả lời trung thực nhất.
  if (process.env.NODE_ENV === 'production') notFound();

  const { locale, t } = await resolvePageI18n(params);
  const { variant } = await searchParams;

  const questions = variant === 'long' ? FIXTURE_LONG : FIXTURE;
  const home = localeHref(locale, '/');

  return (
    <div className={styles.page}>
      <div
        style={{
          background: '#7a2c00',
          color: '#fff',
          padding: '8px 16px',
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        XEM TRƯỚC LAYOUT — dữ liệu giả, chỉ chạy ở dev. Nút “Hoàn tất” sẽ báo lỗi vì không có phiên
        đăng nhập; đó là trạng thái lỗi thật, không phải hỏng. Thử nhãn dài:{' '}
        <Link href="?variant=long" style={{ color: '#fff' }}>
          ?variant=long
        </Link>
      </div>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href={home}>
            <span className="typeCardTitle">KOLO</span>
          </Link>
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
          questions={questions}
          locale={locale}
          doneHref={home}
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
