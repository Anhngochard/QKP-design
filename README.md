# POD Design Manager

Web app quản lý quy trình thiết kế cho mảng Print on Demand (POD) — nơi seller gửi yêu cầu thiết kế, designer xử lý theo workflow, và cả team theo dõi tiến độ ở một chỗ.

Ứng dụng thuần HTML/CSS/JavaScript (ES modules), không cần build step, không cần backend — dữ liệu được lưu trong **IndexedDB** ngay trên trình duyệt.

## Tính năng

- **Dashboard** — tổng quan số lượng design theo từng trạng thái, danh sách design gần đây.
- **Upload New Design** — seller tạo task thiết kế mới: tên design, sản phẩm, màu/size, mockup ảnh (nhiều ảnh: Front/Back/Close-up/Lifestyle), ghi chú, màu tham chiếu, seller/designer phụ trách, hạn chót, độ ưu tiên.
- **Workflow theo trạng thái**: `Waiting Design → Check Design → Fix Design 1 → Fix Design 2 → Support Customer → Done`, hiển thị dạng stepper trực quan trên từng task.
- **Design Task Detail** — trang chi tiết từng task: khu vực designer upload file thiết kế (PNG/PSD/AI/PDF/SVG), ghi chú designer, mockup + seller notes + màu tham chiếu, thông tin task, lịch sử hoạt động, và các action (Submit sang bước tiếp theo, Request More Info, Skip Task, Delete Task).
- **Color Library** — thư viện màu chuẩn (tên màu + mã hex) để designer lên màu chính xác theo brand.
- **Design Storage** — kho lưu trữ toàn bộ design cũ, tìm kiếm/lọc theo trạng thái, seller, designer, độ ưu tiên.
- **Sellers / Designers** — quản lý danh sách seller và designer, xem số lượng design của từng người.

## Chạy thử local

Không cần cài Node.js hay bất kỳ dependency nào. Chỉ cần một static server (do dùng ES modules, không mở trực tiếp bằng `file://`):

```bash
cd pod-design-manager
python3 -m http.server 8787
```

Sau đó mở `http://localhost:8787` trong trình duyệt.

> Dữ liệu mẫu (seed data) sẽ tự động được tạo trong lần chạy đầu tiên. Toàn bộ dữ liệu lưu trong IndexedDB của trình duyệt — xoá dữ liệu trình duyệt sẽ reset lại từ đầu.

## Deploy lên GitHub Pages

Vì đây là site tĩnh, có thể bật GitHub Pages trỏ vào nhánh `main`, thư mục gốc — không cần build.

## Cấu trúc thư mục

```
pod-design-manager/
├── index.html            # Khung app + sidebar
├── css/style.css         # Toàn bộ style
├── js/
│   ├── app.js             # Bootstrap, routing, sidebar
│   ├── lib/
│   │   ├── db.js           # Wrapper IndexedDB
│   │   ├── router.js       # Router dựa trên hash (#/...)
│   │   ├── seed.js         # Dữ liệu mẫu + danh sách trạng thái workflow
│   │   ├── modal.js        # Helper mở/đóng modal
│   │   ├── placeholder.js  # Sinh ảnh placeholder (SVG) cho demo
│   │   └── utils.js        # Định dạng ngày, toast, escape HTML...
│   └── views/
│       ├── dashboard.js
│       ├── designList.js   # Danh sách design (All Designs / theo trạng thái / Design Storage)
│       ├── designDetail.js # Trang chi tiết task
│       ├── uploadDesign.js # Modal tạo design task mới
│       ├── colors.js       # Color Library
│       └── people.js       # Sellers & Designers
```
