/**
 * Tên thương hiệu hiển thị cho người dùng.
 *
 * MỘT NƠI DUY NHẤT. Trước đây chuỗi "Talosmine" nằm rải rác trong hơn mười file — layout,
 * trang đăng nhập, metadata, footer — nên đổi tên là một cuộc lùng sục và chắc chắn sót.
 * Đây chính là chuyện đã xảy ra ngày 2026-08-19 khi thương hiệu đổi sang "Kolo".
 *
 * PHÂN BIỆT VỚI TÊN KỸ THUẬT: repo, project của Docker, schema `control_plane`, tên role
 * database và tiền tố cookie vẫn là `talosmine`. Chúng KHÔNG phải thương hiệu — đổi chúng
 * là một cuộc di trú dữ liệu, và không ai nhìn thấy chúng. Hằng số này chỉ dành cho chữ
 * người dùng đọc được.
 *
 * KHÔNG nằm trong message catalog i18n: tên riêng không dịch, nên để nó ở đó sẽ tạo ra hai
 * bản "dịch" giống hệt nhau và một cơ hội để chúng lệch nhau.
 */
export const BRAND_NAME = 'Kolo';
