/**
 * Loading foundation. `aria-live="polite"` + `role="status"` để screen reader thông báo
 * trạng thái tải mà không cắt ngang người dùng.
 */
export default function Loading() {
  return (
    <main id="main" className="container section">
      <p role="status" aria-live="polite">
        Đang tải…
      </p>
    </main>
  );
}
