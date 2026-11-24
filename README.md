# MoneyLov

Web quản lý chi tiêu cá nhân, kèm chia tiền cho phòng 602. Dữ liệu vào từ file hoặc API do Claude chuẩn bị.

## Tính năng

- **Hộp duyệt**: giao dịch chia ba nhóm *Cần trả lời / Cần xem / Sẵn sàng*.
  - Nút **Tự duyệt** cho các khoản chắc chắn, có xem trước trước khi duyệt.
  - Duyệt hàng loạt và phím tắt (J/K, Enter, X, A, I).
  - Tích "Nhớ cách xử lý này" để tạo quy tắc. Quy tắc được xác nhận đủ số lần sẽ tự áp ở lần nạp sau.
- **Chia tiền theo đợt**:
  - Chế độ chia: đều, theo món (phân bổ ship/giảm giá), số tiền (Grab nhóm), %, số phần, tiền nhà.
  - Tình huống: người bao một phần hoặc cả bill, đồ riêng trong bill, điều chỉnh ±, nhiều người cùng trả hoặc người khác trả, bill tiền mặt, Quang trả hộ Ngọc, cho mượn trong đợt.
  - Quyết toán Nhà / Nợ cũ / Ăn chung / Cho mượn / Đã trả / Còn lại. Nợ cũ tự lấy từ đợt chốt trước, sửa tay phải ghi lý do.
  - Tin nhắn nhắc nợ để copy.
  - Chốt và mở lại đợt; mở lại phải ghi lý do.
  - Xuất `toan-bo.json` cho `sheet_b.py`.
- **Ví & số dư**: ngân hàng, thẻ tín dụng, tiền mặt, ví điện tử. Chuyển giữa các ví không tính là chi.
- **Ngân sách** theo danh mục hoặc tổng, theo tháng, có chuyển dư; cảnh báo ở 80% và 100%.
- **Báo cáo**: theo tháng (Riêng/Chung/Nhà), theo danh mục, theo ngày, top khoản chi, xuất CSV.
- **Khoản định kỳ** tự khớp với giao dịch thật. **Sổ vay / cho vay** theo dõi trả từng phần.
- **Nhật ký học** cho Claude (`/api/learning-export`), sao lưu và khôi phục JSON, giao diện sáng/tối, dùng tốt trên điện thoại (PWA).

## Cấu trúc

```
packages/core   Logic thuần + test: chia tiền, quyết toán, đọc file nạp, quy tắc, xuất sheet
apps/api        Hono + Drizzle + PostgreSQL (PGlite khi dev/test)
apps/web        React + Vite + Tailwind
e2e/            Kiểm thử khói bằng Playwright (chụp màn hình mọi trang)
docs/           Định dạng file nạp, API cho Claude
```

## Chạy khi phát triển

```sh
corepack enable && pnpm install
pnpm dev:api     # http://localhost:8787, dữ liệu PGlite trong apps/api/data
pnpm dev:web     # http://localhost:5173
pnpm test        # test core + API (API chạy trên PGlite trong bộ nhớ)
```

Đổi `apps/api/src/schema.ts` thì tạo migration mới bằng `pnpm db:generate`.

## Triển khai lên VPS (Docker)

1. Trỏ DNS: bản ghi A cho `chi.zett.io.vn` (hoặc tên miền bạn chọn) về IP của VPS.
2. Chép (hoặc `git clone`) repo này lên VPS, vào thư mục gốc rồi:
   ```sh
   cp .env.example .env   # sửa DOMAIN, POSTGRES_PASSWORD
   docker compose --profile caddy up -d --build
   ```
   Caddy tự xin chứng chỉ HTTPS. Nếu VPS đã có nginx chiếm cổng 80/443, bỏ `--profile caddy` và cho nginx `proxy_pass http://127.0.0.1:8787`.
3. Mở web và đặt mật khẩu ở lần vào đầu tiên.
4. Vào **Cài đặt → API cho Claude**, tạo token và lưu vào `MONEYLOV_TOKEN` ở máy chạy Claude Code.

Bản sao lưu Postgres nằm trong `./backups` (mỗi ngày một file, giữ 30 ngày). Ngoài ra có **Cài đặt → Dữ liệu → Tải bản sao lưu** (JSON).

## Quy trình mỗi đợt

1. Claude tạo file nạp từ sao kê MB, email thẻ và ảnh Grab: Việc A, xem `docs/import-schema.md`. Claude nạp qua API (`dry_run` trước), hoặc bạn bấm **Nạp file**.
2. Trong **Hộp duyệt**: bấm *Tự duyệt* các khoản chắc chắn, rồi trả lời các khoản còn lại.
3. Trong **Chia tiền**: kiểm tra quyết toán, copy tin nhắc nợ, ghi các khoản trả tiền mặt, rồi **Chốt đợt**.
4. **Xuất cho Sheet** để lấy `toan-bo.json`, rồi chạy Việc B (`sheet_b.py`) như cũ.
