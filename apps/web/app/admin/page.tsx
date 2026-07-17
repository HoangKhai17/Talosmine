/**
 * Không reachable ở P1 — `proxy.ts` trả 403 và `layout.tsx` gọi `notFound()` trước khi
 * page này render. Page tồn tại để route `/admin` là một route thật đi qua guard contract,
 * thay vì một route không tồn tại mà tự nhiên 404.
 *
 * Không form mutation, không dashboard dữ liệu, không role giả (phase-1 mục 11).
 */
export default function AdminHomePage() {
  return (
    <div className="stack">
      <h1>Quản trị</h1>
      <p className="muted">Khung quản trị. Chưa có chức năng nào được hiện thực.</p>
    </div>
  );
}
