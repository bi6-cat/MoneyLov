# Định dạng file nạp và API cho Claude

Web nhận hai định dạng qua `POST /api/import` (hoặc nút **Nạp file** trong Hộp duyệt).

- **Phiên bản 1**: file `dot-*.json` hiện tại do `build.py` tạo ra. Giữ nguyên, không cần sửa.
- **Phiên bản 2**: tiền tính bằng đồng (số nguyên), gợi ý dùng thẳng cấu trúc của web. Nên dùng cho các đợt mới.

## Quy tắc chung

- **Idempotent theo id** (`id` ở v1, `ext_id` ở v2). Nạp lại cùng file không tạo trùng.
  - Khoản chưa có: thêm vào, trạng thái *chờ duyệt*.
  - Khoản đang chờ duyệt: cập nhật nếu có gì khác.
  - Khoản đã duyệt, hoặc thuộc đợt đã chốt: giữ nguyên (báo `locked`).
- Muốn bổ sung giao dịch thiếu (ví dụ email thẻ 9786) thì nạp lại cả file với **id cũ giữ nguyên**.
- Luôn chạy thử trước bằng `?dry_run=1`. Kết quả gồm số khoản mới/cập nhật/không đổi/khoá, danh sách chi tiết, và các kiểm tra đối soát:
  - id không trùng;
  - cặp giao dịch đủ hai đầu;
  - số dòng sao kê và số email thẻ;
  - tổng vào, tổng ra;
  - số dư đầu + vào − ra = số dư cuối.
- Quy tắc đã học (Cài đặt → Quy tắc) được áp lúc nạp:
  - Quy tắc được xác nhận ≥ N lần (mặc định 3) thay gợi ý của file và bỏ câu hỏi.
  - Quy tắc yếu hơn chỉ thay gợi ý khi file đánh dấu `nghi`.

## API

```sh
# Chạy thử
curl -sS -X POST "https://<domain>/api/import?dry_run=1&filename=dot-2026-12-24.json" \
  -H "Authorization: Bearer $MONEYLOV_TOKEN" -H "Content-Type: application/json" \
  --data-binary @dot-2026-12-24.json

# Nạp thật: bỏ dry_run=1

# Dữ liệu học (quy tắc, đối tác → cách xử lý, các lần gợi ý bị sửa)
curl -sS "https://<domain>/api/learning-export?since=2026-11-01" -H "Authorization: Bearer $MONEYLOV_TOKEN"
```

Token tạo trong **Cài đặt → API cho Claude**. Có hai quyền:

- `import`: nạp file, và đọc được cả dữ liệu học.
- `read`: chỉ đọc dữ liệu học.

Token không vào được các trang khác.

Trước khi tạo file nạp đợt mới, Claude nên gọi `learning-export` và học từ phần `corrections`: đây là những lần Quang sửa gợi ý.

## Phiên bản 2

```jsonc
{
  "version": 2,
  "period": {                       // tuỳ chọn: tạo đợt nếu chưa có (khớp theo name + from)
    "name": "Từ 24/11",
    "from": "2026-11-24",
    "to": "2026-12-23",
    "rent_total": 8500000,
    "carried": { "D": 7412800 }     // nợ cũ ghi tay (bình thường để trống: web tự lấy từ đợt trước)
  },
  "reconciliation": {               // tuỳ chọn, đồng
    "opening_balance": 3025924, "closing_balance": 1234567,
    "bank_rows": 98, "card_rows": 60, "bank_in": 0, "bank_out": 0
  },
  "transactions": [
    {
      "ext_id": "FT26330000000000",       // mã FT…, A-…, A-…-2 (lần trừ thứ 2), 2888666222-YYYYMMDD (lãi)
      "occurred_at": "2026-11-25T12:03",
      "amount": 120440,                   // đồng, luôn dương
      "direction": "out",                 // "out" | "in"
      "source": "Card 8508",              // khớp "Nguồn khi nạp" của ví: MB, Card 8508, Card 9786…
      "raw_content": "Grab* A-AXK9USNGXEGUAV",
      "counterparty": "GRAB",
      "counterparty_account": null,
      "counterparty_bank": null,
      "confidence": "chac",               // "chac" | "nghi"
      "question": null,                   // câu hỏi cho Quang; có câu hỏi thì không tự duyệt
      "pair_ext_id": null,                // cặp trừ/hoàn
      "suggestion": { "action": "split", "category": "Ăn uống",
        "split": { "mode": "exact", "label": "grab_nhom",
                   "amounts": { "Q": 32925, "Cg": 33630, "D": 29406, "M": 24479 } } }
    }
  ]
}
```

### `suggestion`

| action | Trường thêm | Ý nghĩa |
|---|---|---|
| `expense` | `scope`: `Rieng` / `Chung` / `Nha`, `category` | Chi tiêu không chia |
| `split` | `split` (xem dưới), `category`, `isRent` | Chia tiền trong đợt |
| `income` | `category`, `incomeType`: `thu_nhap` / `ngoai_602` / `khac` | Thu nhập |
| `settlement` | `person` | Bạn phòng trả tiền cho Quang |
| `loan` | `person`, `direction`: `lend` / `borrow` / `repay_in` / `repay_out` | Vay, cho vay, trả nợ |
| `transfer` | `toAccount` (id ví) | Chuyển giữa các ví của Quang |
| `ignore` | `reason` | Loại ra (trả sao kê thẻ, hoàn tiền…) |

### `split`

Tổng bill lấy từ `amount` của giao dịch. Mọi số tiền tính bằng đồng.

| mode | Trường | Ghi chú |
|---|---|---|
| `equal` | `people: ["Q","D","C","M"]` | Chia đều |
| `rent` | `people` (bỏ trống = người ở phòng) | Tiền nhà |
| `exact` | `amounts: {Q: 34000, M: 34000}` | Đơn Grab nhóm. Lệch tổng thì chia theo tỉ lệ và cảnh báo |
| `percent` | `percents: {Q: 70, D: 30}` | |
| `shares` | `weights: {Q: 2, D: 1}` | Số suất |
| `items` | `items: [{name, price, people: [...]}]` | Theo món. Ship, phí, giảm giá phân bổ theo tỉ lệ giá món |

Các trường dùng được cho mọi chế độ:

- `covers: [{person, amount}]` hoặc `[{person, full: true}]`: người bao một phần, hoặc cả bill.
- `privates: [{person, amount, note}]`: đồ riêng trong bill. Đồ riêng của Quang tính vào chi tiêu Riêng.
- `adjustments: [{person, delta}]`: cộng/trừ cho một người, phần chênh bù đều cho những người còn lại.
- `payers: [{person, amount}]`: người khác trả hoặc nhiều người cùng trả. Bỏ trống nghĩa là Quang trả hết.

Mã người: `Q` Quang, `D` Duy, `C` Chung, `M` Minh, `N` Ngọc (Quang trả hộ), `K` Khải, `Cg` Cường, `Qy` aQuy.

## Xuất cho Google Sheet

`GET /api/periods/:id/export` (nút **Xuất cho Sheet** trong trang Chia tiền) trả về `toan-bo.json` đúng định dạng `sheet_b.py` đang đọc:

- `trang_tinh_1`: các bill chia, không gồm tiền nhà.
- `quyet_toan`: theo người, gồm `nha`, `rieng`, `tra`…
- `chi_tieu_quang.dong`: chi tiêu của Quang.

Nhờ vậy Việc B ghi Sheet chạy tiếp mà không cần sửa. Đơn vị là k (nghìn đồng), giống file cũ.
