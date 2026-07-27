import Link from 'next/link';

/**
 * Trang cho route đã có trong điều hướng nhưng CHƯA có nội dung.
 *
 * Vì sao tồn tại: header dựng theo wireframe nên có sẵn mục Công cụ / Danh mục / Blog.
 * Không có trang tương ứng thì các mục đó trả 404 — trông như hệ thống hỏng. Trang này
 * nói thẳng "chưa có", đúng sự thật và không giả vờ có tính năng.
 *
 * Khi trang thật ra đời thì xoá file tương ứng, không phải sửa header.
 */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="container section stack">
      <h1 className="typeH1">{title}</h1>
      <p className="typeBodyLarge textSecondary">{description}</p>
      <div className="notice">
        <p className="typeBody">
          Phần này chưa được xây dựng. Danh mục ứng dụng thuộc giai đoạn sau và còn chờ chốt danh
          sách ứng dụng của Hub.
        </p>
      </div>
      <p>
        <Link className="typeBody" href="/">
          Về trang chủ
        </Link>
      </p>
    </div>
  );
}
