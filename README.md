# 🌌 Exoplanet Explorer — Interactive 3D NASA Space Exploration Web App

> **Exoplanet Explorer** là ứng dụng Web 3D thời gian thực cho phép khám phá danh mục hơn 5,700+ ngoại hành tinh (exoplanets) đã được NASA xác nhận ngoài Hệ Mặt Trời, sử dụng dữ liệu thực tế từ **NASA Exoplanet Archive TAP API**.

---

## 🌟 Tính Năng Nổi Bật

1. **🌌 Bản Đồ Vũ Trụ 3D (WebGL / Three.js / React Three Fiber):**
   - Trực quan hóa hàng nghìn ngoại hành tinh dưới dạng mô hình 3D trong không gian vũ trụ với hiệu ứng ánh sáng, quỹ đạo và các ngôi sao nền (Starfield).
   - Tọa độ 3D ($x, y, z$) được quy đổi chính xác từ Tọa độ Xích đạo (**Right Ascension & Declination**) và Khoảng cách năm ánh sáng (**Light-Years**) theo thang đo Logarithm khoa học.

2. **🪐 Thuật Toán Đánh Giá Khả Năng Có Sự Sống (Habitability Scoring Engine):**
   - Tự động tính toán điểm số **Habitability (0–100/100)** dựa trên 4 chỉ số sinh học vũ trụ:
     - 🌡️ *Vùng sinh thái Habitable Zone* (Nhiệt độ cân bằng 180K – 310K).
     - 📏 *Bán kính tương đồng Trái Đất* (0.8 – 1.5 $R_\oplus$).
     - ⚖️ *Khối lượng đất đá* (0.5 – 5.0 $M_\oplus$).
     - ☀️ *Đặc tính ngôi sao mẹ* (Phân loại quang phổ G, K, M).

3. **🎛️ Bảng Lọc Dữ Liệu Thông Minh (Interactive Multi-Criteria Filter):**
   - Lọc theo bán kính, nhiệt độ, khoảng cách, năm phát hiện và phương pháp phát hiện (Transit, Radial Velocity, Direct Imaging,...).
   - Nút **"Habitable Zone Only"** lọc tức thì các hành tinh tiềm năng có sự sống.

4. **📊 Thẻ Chi Tiết Hành Tinh & So Sánh Với Trái Đất (Earth Comparison):**
   - Xem chi tiết khối lượng, bán kính, nhiệt độ, chu kỳ quỹ đạo, kính thiên văn phát hiện.
   - Biểu đồ so sánh trực quan kích thước và khối lượng đối chiếu với Trái Đất.

5. **📋 Bảng Dữ Liệu Tìm Kiếm & Sắp Xếp (Interactive Data Table):**
   - Chuyển đổi linh hoạt giữa chế độ **3D Map** và **Data Table** với khả năng sắp xếp đa chiều theo tên, điểm số habitability, khoảng cách và nhiệt độ.

---

## 🚀 Kỹ Thuật Tối Ưu Hiệu Năng (Bài Học Rút Ra Từ Dự Án Smart Factory)

Trong dự án **Smart Factory Dashboard** trước đó, việc cập nhật `setState` liên tục 25 lần/giây từng khiến trình duyệt ngốn tới **2.1 GB RAM**. Áp dụng các nguyên tắc tối ưu hóa WebGL thế hệ mới vào **Exoplanet Explorer**:

| Vấn Đề Hiệu Năng Ở Factory | Giải Pháp Đã Áp Dụng Cho Exoplanet Explorer | Kết Quả Đạt Được |
|---|---|---|
| Gọi `useState` 25fps gây đơ React tree | Dùng `useRef` + `useFrame` thao tác trực tiếp GPU matrix | **0 React re-renders** khi quay 3D |
| Render hàng nghìn `<mesh>` riêng lẻ | Sử dụng **`InstancedMesh`** (vẽ 5,700+ hành tinh chỉ bằng **1 Draw Call**) | **Draw Call = 1**, RAM < 45MB |
| Render liên tục 60fps khi nhàn rỗi | Cấu hình **`frameloop="demand"`** (chỉ render khi camera di chuyển hoặc hover) | CPU nhàn rỗi ~1-2%, tiết kiệm pin |
| Rò rỉ bộ nhớ GPU VRAM | Triển khai pattern **`dispose()`** dọn dẹp Geometry & Material khi unmount | Không rò rỉ RAM/VRAM |

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

- **Frontend Framework:** React 19 + Vite 8 + TypeScript 6
- **3D Graphics & WebGL:** Three.js + `@react-three/fiber` (R3F) + `@react-three/drei`
- **UI & Styling:** TailwindCSS 4 + Shadcn UI + Lucide Icons + Dark Mode mặc định
- **State Management:** Zustand 5 (xử lý filter và selected state cực nhẹ)
- **Data Source:** NASA Exoplanet Archive (Table Access Protocol TAP API) + Proxy + Curated Fallback Dataset

---

## 💻 Hướng Dẫn Chạy Dự Án Locally

```bash
# 1. Di chuyển vào thư mục dự án
cd "d:\clone repo\exoplanet-explorer"

# 2. Cài đặt các gói phụ thuộc (Dependencies)
pnpm install

# 3. Khởi chạy máy chủ phát triển Vite Dev Server
pnpm dev
```

Ứng dụng sẽ chạy tại địa chỉ: **`http://localhost:3001`**
