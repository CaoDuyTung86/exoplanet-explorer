# 🌌 Bản Đồ Ngoại Hành Tinh 3D (Exoplanet Explorer)

Một ứng dụng web 3D thực tế ảo vô cùng sống động, tối ưu hóa cực cao để hiển thị hơn 5.700 ngoại hành tinh đã được xác nhận, sử dụng dữ liệu thực từ NASA Exoplanet Archive. Xây dựng bằng React, Three.js, và WebGL, dự án này vượt qua các giới hạn kết xuất 3D trên trình duyệt.

![Bản Đồ Ngoại Hành Tinh](/public/textures/sun_color.jpg) *(Thay bằng ảnh chụp màn hình thực tế)*

## 🚀 Tính Năng Chính

*   **Vũ Trụ 3D Tương Tác:** Khám phá hơn 5.700 hành tinh được render theo thời gian thực (60-165 FPS). Camera nội suy di chuyển mượt mà giữa các hệ sao.
*   **Shader Đồ Họa Cấp Độ AAA:** Shader WebGL GLSL tùy chỉnh cho Hành tinh khí (những dải mây xoáy), Hành tinh dung nham (vết nứt rực sáng), và Hành tinh đá (địa hình Simplex noise) - tất cả được tính toán động dựa trên thông số của NASA.
*   **Âm Thanh Tổng Hợp (Ambient Audio):** Tạo âm thanh vũ trụ bằng Web Audio API thuần túy không cần thư viện nặng. Cao độ âm thanh tỷ lệ nghịch với bán kính hành tinh, trong khi độ sáng của âm (filter cutoff) thay đổi theo nhiệt độ của nó.
*   **Dữ Liệu NASA & Web Worker:** Lấy và xử lý tập dữ liệu khổng lồ từ NASA TAP API thông qua Web Worker chạy ngầm, đảm bảo giao diện không bao giờ bị đơ (UI freezing).
*   **Đánh Giá Khả Năng Sống (Habitability):** Tự động tính toán Điểm Sống Được (0-100) dựa trên nhiệt độ cân bằng và bán kính hành tinh, kết hợp với hiệu ứng Vành đai sống được (Habitable Zone) phát sáng.
*   **Đa Ngôn Ngữ (Anh/Việt):** Hỗ trợ Tiếng Anh và Tiếng Việt, với thuật toán tự động dịch các thuật ngữ thiên văn học phức tạp (vd: *Radial Velocity* -> *Vận tốc xuyên tâm*).

## 🛠️ Công Nghệ Sử Dụng

*   **Frontend Framework:** React 18, TypeScript, Vite
*   **3D Engine:** Three.js, React Three Fiber (R3F), React Three Drei
*   **Styling:** Tailwind CSS, Lucide React (Icons)
*   **State Management:** Zustand
*   **Audio:** Howler.js & Native Web Audio API (BiquadFilters, Oscillators)
*   **Data Source:** NASA Exoplanet Archive (TAP API)

## 💻 Chạy Ứng Dụng (Local)

1.  Clone kho lưu trữ:
    ```bash
    git clone https://github.com/yourusername/exoplanet-explorer.git
    cd exoplanet-explorer
    ```
2.  Cài đặt các gói phụ thuộc:
    ```bash
    pnpm install
    ```
3.  Khởi động server phát triển:
    ```bash
    pnpm run dev
    ```

## 🧠 Điểm Nhấn Kỹ Thuật

### Tối Ưu Hóa InstancedMesh
Để hiển thị 5.700 khối cầu mà không làm treo GPU, dự án sử dụng `THREE.InstancedMesh`, cho phép vẽ toàn bộ hành tinh chỉ với 1 "draw call". Khu vực bấm chuột (hit-box) tự động thu nhỏ khi người dùng đang zoom sát một hành tinh để tránh bấm nhầm, đồng thời vẫn dễ dàng chọn khi ở xa.

### Shader Sinh Tự Động (`onBeforeCompile`)
Thay vì tải hàng nghìn ảnh texture nặng nề, ứng dụng chèn thẳng các thuật toán nhiễu hạt (Simplex 3D noise) vào mã nguồn shader của `MeshStandardMaterial`. Mọi hiệu ứng đổ bóng, phát sáng được tính toán toán học trực tiếp trên GPU, giúp file tải về siêu nhỏ gọn và hiệu suất cực cao.

### Xử Lý Lỗi Race-Condition của React StrictMode
Đã triển khai cơ chế "Global Promise Caching" để chặn việc tải dữ liệu từ API của NASA tới 2 lần liên tiếp do chu kỳ mount của React 18 Strict Mode, tiết kiệm băng thông và ngăn ngừa việc bị chặn API (rate-limiting).

---
*Dự án tâm huyết kết hợp giữa thiên văn học, trực quan hóa dữ liệu và đồ họa web 3D nâng cao.*
