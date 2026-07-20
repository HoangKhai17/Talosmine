import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { callControlPlane } from '../../server/control-plane-boundary';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Talosmine — Trang chính',
};

/**
 * Trang chính. Hiển thị KHÁC NHAU tuỳ đã đăng nhập hay chưa:
 *
 *   - Khách vãng lai: giới thiệu + nút đăng nhập.
 *   - Đã đăng nhập: bảng điều khiển với lối tắt tới tài khoản và phiên.
 *
 * Vì sao không tách thành hai route: `/` là nơi người dùng quay về sau khi đăng nhập và
 * sau khi đăng xuất. Một route duy nhất tự đổi nội dung tránh được vòng redirect và tránh
 * việc bookmark trỏ tới trang "sai vai".
 *
 * Nội dung cố ý chỉ mô tả capability ĐÃ TỒN TẠI THẬT. Không dựng danh sách ứng dụng giả:
 * danh sách app là dữ liệu của Catalog (chưa implement), và dữ liệu giả sẽ che mất việc
 * backend chưa có contract.
 */
export default async function UserHomePage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('__Host-talos_session')?.value;
  const viewer = await readViewer(sessionToken);

  if (viewer) {
    return <SignedInHome name={viewer.name} isAdmin={viewer.isAdmin} />;
  }

  return <PublicHome />;
}

function SignedInHome({ name, isAdmin }: { name: string | null; isAdmin: boolean }) {
  return (
    <section className="section">
      <div className="container">
        <div className={styles.dashboardHeader}>
          <h1 className="typeH1">{name ? `Chào ${name}` : 'Chào bạn'}</h1>
          <p className="typeBodyLarge textSecondary">Đây là bảng điều khiển tài khoản của bạn.</p>
        </div>

        <ul className={styles.cardGrid}>
          <li className={styles.card}>
            <h2 className="typeCardTitle">Hồ sơ tài khoản</h2>
            <p className="typeBodySmall textSecondary">
              Xem và sửa tên hiển thị, ngôn ngữ, múi giờ. Địa chỉ thư điện tử do hệ thống đăng nhập
              quản lý.
            </p>
            <p className={styles.cardAction}>
              <Link className="typeBodySmall" href="/account">
                Mở hồ sơ →
              </Link>
            </p>
          </li>

          <li className={styles.card}>
            <h2 className="typeCardTitle">Phiên đăng nhập</h2>
            <p className="typeBodySmall textSecondary">
              Xem các thiết bị đang đăng nhập và thu hồi phiên lạ. Thu hồi có hiệu lực ngay trên máy
              chủ.
            </p>
            <p className={styles.cardAction}>
              <Link className="typeBodySmall" href="/account/sessions">
                Xem phiên →
              </Link>
            </p>
          </li>

          {/*
            Ô quản trị chỉ hiện với người có quyền. Đây thuần tuý là UX — gõ thẳng `/admin`
            vẫn bị proxy, RSC layout và Control Plane chặn độc lập.
          */}
          {isAdmin ? (
            <li className={styles.card}>
              <h2 className="typeCardTitle">Khu quản trị</h2>
              <p className="typeBodySmall textSecondary">
                Tra cứu tài khoản, khoá hoặc mở khoá, thu hồi phiên. Mọi thao tác cần lý do và được
                ghi nhật ký.
              </p>
              <p className={styles.cardAction}>
                <Link className="typeBodySmall" href="/admin">
                  Vào khu quản trị →
                </Link>
              </p>
            </li>
          ) : null}
        </ul>

        <div className={styles.callout}>
          <h2 className="typeH3">Ứng dụng sẽ xuất hiện ở đây</h2>
          <p className="typeBody textSecondary">
            Danh mục ứng dụng, gói dịch vụ và hạn mức sử dụng thuộc các giai đoạn sau. Hiện tại nền
            tảng mới có danh tính, tài khoản và phiên làm việc.
          </p>
        </div>
      </div>
    </section>
  );
}

function PublicHome() {
  return (
    <>
      <section className="section">
        <div className="container">
          <div className={styles.hero}>
            <span className={`typeCaption ${styles.tag}`}>Bản dựng nền tảng</span>
            <h1 className="typeHero">Một tài khoản cho mọi công cụ</h1>
            <p className="typeBodyLarge textSecondary">
              Talosmine là điểm truy cập tập trung: đăng nhập một lần, quản lý tài khoản và phiên
              làm việc ở một nơi, rồi mở các công cụ được cấp quyền.
            </p>
            <div className={styles.heroActions}>
              <Link className={`typeBody ${styles.buttonPrimary}`} href="/auth">
                Đăng nhập
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className={styles.sectionHeader}>
            <h2 className="typeH2">Nền tảng đã sẵn sàng</h2>
            <p className="typeBody textSecondary">
              Những phần dưới đây đã được xây và kiểm chứng. Các tính năng còn lại sẽ bổ sung theo
              từng giai đoạn.
            </p>
          </div>

          <ul className={styles.cardGrid}>
            <li className={styles.card}>
              <h3 className="typeCardTitle">Tài khoản tập trung</h3>
              <p className="typeBodySmall textSecondary">
                Mỗi người dùng có một hồ sơ duy nhất, liên kết an toàn với nhà cung cấp danh tính.
                Không ghép tài khoản theo địa chỉ thư điện tử.
              </p>
              <p className={`typeCaption textTertiary ${styles.cardMeta}`}>Đã hoàn thành</p>
            </li>

            <li className={styles.card}>
              <h3 className="typeCardTitle">Phiên làm việc</h3>
              <p className="typeBodySmall textSecondary">
                Xem các thiết bị đang đăng nhập và thu hồi bất kỳ phiên nào. Máy chủ chỉ lưu dấu vân
                của phiên, không lưu mã phiên.
              </p>
              <p className={`typeCaption textTertiary ${styles.cardMeta}`}>Đã hoàn thành</p>
            </li>

            <li className={styles.card}>
              <h3 className="typeCardTitle">Quản trị và nhật ký</h3>
              <p className="typeBodySmall textSecondary">
                Phân quyền theo vai trò, mặc định từ chối. Mọi thao tác quản trị đều cần lý do và
                được ghi lại để đối soát.
              </p>
              <p className={`typeCaption textTertiary ${styles.cardMeta}`}>Đã hoàn thành</p>
            </li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className={styles.callout}>
            <h2 className="typeH3">Đang trong quá trình xây dựng</h2>
            <p className="typeBody textSecondary">
              Giao diện này là bản dựng để kiểm chứng hệ thống thiết kế. Bố cục sẽ được thay bằng
              thiết kế chính thức.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

interface Viewer {
  name: string | null;
  isAdmin: boolean;
}

/**
 * Đọc danh tính người xem cho trang chủ.
 *
 * Mọi lỗi đều trả `null` = coi như khách vãng lai. Trang chủ KHÔNG được sập chỉ vì Control
 * Plane chậm hay phiên vừa hết hạn — nó là nơi người dùng quay về khi có sự cố.
 */
async function readViewer(sessionToken: string | undefined): Promise<Viewer | null> {
  if (!sessionToken) return null;

  try {
    const accountResponse = await callControlPlane({
      method: 'GET',
      path: '/v1/me/account',
      sessionToken,
    });
    if (!accountResponse.ok) return null;

    const account = (await accountResponse.json()) as {
      displayName?: unknown;
      email?: unknown;
    };

    const name =
      typeof account.displayName === 'string' && account.displayName !== ''
        ? account.displayName
        : typeof account.email === 'string' && account.email !== ''
          ? account.email
          : null;

    // Quyền admin quyết định có hiện ô "Khu quản trị". Lỗi ở bước này chỉ làm ẩn ô đó,
    // không ảnh hưởng phần còn lại của trang.
    let isAdmin = false;
    try {
      const permissionsResponse = await callControlPlane({
        method: 'GET',
        path: '/v1/me/permissions',
        sessionToken,
      });
      if (permissionsResponse.ok) {
        const data = (await permissionsResponse.json()) as { permissions?: unknown };
        isAdmin = Array.isArray(data.permissions) && data.permissions.length > 0;
      }
    } catch {
      isAdmin = false;
    }

    return { name, isAdmin };
  } catch {
    return null;
  }
}
