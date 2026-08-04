# POD Design Manager

Web app quản lý quy trình thiết kế cho mảng Print on Demand (POD) — nơi seller gửi yêu cầu thiết kế, designer xử lý theo workflow, và cả team theo dõi tiến độ ở một chỗ.

Ứng dụng thuần HTML/CSS/JavaScript (ES modules), không cần build step. Toàn bộ dữ liệu — tài khoản, design, seller, designer, color, file thiết kế/mockup — lưu **dùng chung** trên [Supabase](https://supabase.com) (miễn phí): Postgres cho dữ liệu, Storage cho file, Auth cho đăng nhập. Bất kỳ ai đăng nhập từ máy nào cũng thấy cùng một dữ liệu theo thời gian thực. Xem [`SETUP_ACCOUNTS.md`](SETUP_ACCOUNTS.md) để thiết lập (~10 phút, không cần cài gì trên máy).

## Tính năng

- **Dashboard** — tổng quan số lượng design theo từng trạng thái, danh sách design gần đây.
- **Upload New Design** — seller tạo task thiết kế mới: tên design, sản phẩm, màu/size, mockup ảnh (nhiều ảnh: Front/Back/Close-up/Lifestyle), ghi chú, màu tham chiếu, seller/designer phụ trách, hạn chót, độ ưu tiên.
- **Workflow theo trạng thái**: `Waiting Design → Check Design → Fix Design → Support Customer → Done`, hiển thị dạng stepper trực quan trên từng task.
- **Design Task Detail** — trang chi tiết từng task: khu vực designer upload file thiết kế (PNG/PSD/AI/PDF/SVG), ghi chú designer, mockup + seller notes + màu tham chiếu, thông tin task, lịch sử hoạt động, và các action (Submit sang bước tiếp theo, Request More Info, Skip Task, Delete Task).
- **Color Library** — thư viện màu chuẩn (tên màu + mã hex) để designer lên màu chính xác theo brand.
- **Design Storage** — kho lưu trữ toàn bộ design cũ, tìm kiếm/lọc theo trạng thái, seller, designer, độ ưu tiên.
- **Chuyển trạng thái trực tiếp ngay trong bảng danh sách** — cột Status ở All Designs / Design Storage / các trang theo trạng thái là một dropdown: chọn thẳng Waiting Design / Check Design / Fix Design / Support Customer / Done là task nhảy sang đúng bước đó ngay, không cần mở từng task. Riêng lựa chọn "Check Design" yêu cầu task đã có file thiết kế (Front hoặc Back) mới chọn được.
- **Sellers / Designers** — quản lý danh sách seller và designer, xem số lượng design của từng người.
- **Nhận diện ảnh trùng mẫu (AI)** — khi upload mockup ở form "Upload New Design", app tự động so sánh ảnh vừa chọn với toàn bộ mockup đã có trong hệ thống (bằng thuật toán perceptual hashing, chạy hoàn toàn phía client). Nếu phát hiện ảnh trùng với một thiết kế **đã hoàn thành (Done)**, hệ thống sẽ đề xuất **tự động dùng lại file thiết kế có sẵn** — task mới được tạo thẳng ở trạng thái Done, không cần designer làm lại từ đầu.
- **Tài khoản & bảo mật (Admin / Seller / Designer)** — đăng nhập bằng Supabase Auth thật (mật khẩu mã hoá, kiểm tra ở server). Chỉ Admin tạo được tài khoản mới, ngay trong app (trang **Manage Accounts**, không cho tự đăng ký). Đổi vai trò và **khoá/mở khoá tài khoản** — tài khoản bị khoá mất quyền truy cập dữ liệu ngay lập tức ở tầng database (Row Level Security), phù hợp khi nhân viên nghỉ việc. Chi tiết thiết lập: [`SETUP_ACCOUNTS.md`](SETUP_ACCOUNTS.md).
- **Dữ liệu & file dùng chung thời gian thực** — mọi design, mockup, file thiết kế (PNG/PSD/AI/PDF) đều lưu trên Supabase (Postgres + Storage), không còn giới hạn theo từng trình duyệt/máy. Seller upload mockup trên máy A, designer mở trên máy B vẫn thấy và tải file về bình thường.

## Chạy thử local

Không cần cài Node.js hay bất kỳ dependency nào. Chỉ cần một static server (do dùng ES modules, không mở trực tiếp bằng `file://`):

```bash
cd pod-design-manager
python3 -m http.server 8787
```

Sau đó mở `http://localhost:8787` trong trình duyệt. Trước khi dùng được, làm theo [`SETUP_ACCOUNTS.md`](SETUP_ACCOUNTS.md) để tạo project Supabase (miễn phí), chạy 2 file SQL và điền vào `js/lib/supabaseConfig.js` — nếu chưa cấu hình, app sẽ hiện màn hình nhắc thiết lập thay vì lỗi trắng trang.

> Dữ liệu mẫu (seed data) sẽ tự động được tạo trong Supabase ở lần đăng nhập đầu tiên nếu database đang trống. Vì dữ liệu dùng chung, xoá dữ liệu trình duyệt (cache/cookies) không còn ảnh hưởng gì — chỉ mất khi bạn chủ động xoá trong Supabase.

## Deploy lên GitHub Pages

Vì đây là site tĩnh, có thể bật GitHub Pages trỏ vào nhánh `main`, thư mục gốc — không cần build.

## Cấu trúc thư mục

```
pod-design-manager/
├── index.html            # Khung app + sidebar
├── css/style.css         # Toàn bộ style
├── js/
│   ├── app.js             # Bootstrap, auth gate, routing, sidebar
│   ├── lib/
│   │   ├── db.js               # Data layer: DB.getAll/get/put/delete — nói chuyện với Supabase Postgres
│   │   ├── storage.js          # Upload file thật (mockup, file thiết kế) lên Supabase Storage
│   │   ├── router.js           # Router dựa trên hash (#/...)
│   │   ├── seed.js             # Dữ liệu mẫu + danh sách trạng thái workflow
│   │   ├── modal.js            # Helper mở/đóng modal
│   │   ├── placeholder.js      # Sinh ảnh placeholder (SVG) cho demo
│   │   ├── imageHash.js        # Perceptual hash — nhận diện ảnh trùng mẫu
│   │   ├── supabaseConfig.js   # Project URL & anon key (điền theo SETUP_ACCOUNTS.md)
│   │   ├── supabase.js         # Khởi tạo Supabase client
│   │   ├── auth.js             # Đăng nhập/đăng xuất/quản lý profile qua Supabase
│   │   ├── session.js          # Lưu profile người dùng hiện tại trong bộ nhớ
│   │   └── utils.js            # Định dạng ngày, toast, escape HTML...
│   └── views/
│       ├── login.js        # Màn hình đăng nhập
│       ├── accounts.js     # Manage Accounts (chỉ Admin) — tạo/khoá tài khoản
│       ├── dashboard.js
│       ├── designList.js   # Danh sách design (All Designs / theo trạng thái / Design Storage)
│       ├── designDetail.js # Trang chi tiết task
│       ├── uploadDesign.js # Modal tạo design task mới
│       ├── colors.js       # Color Library
│       └── people.js       # Sellers & Designers
├── supabase/
│   ├── schema.sql                 # Bảng profiles (tài khoản), trigger, RLS
│   ├── schema_data.sql            # Bảng sellers/designers/colors/designs, Storage bucket, RLS
│   └── functions/create-user/     # Edge Function tạo tài khoản (giữ service role key an toàn ở server)
└── SETUP_ACCOUNTS.md      # Hướng dẫn thiết lập tài khoản, database & storage từng bước
```
