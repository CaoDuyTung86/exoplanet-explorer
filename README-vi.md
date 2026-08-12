# 🌌 Exoplanet Explorer 3D (Bản đồ Ngoại Hành Tinh)

Một ứng dụng web 3D chân thực, tối ưu hóa cao độ để mô phỏng hơn 5,700 ngoại hành tinh đã được xác nhận, sử dụng dữ liệu thực tế từ Kho lưu trữ Ngoại hành tinh của NASA. Xây dựng bằng React, Three.js và WebGL, dự án này vượt qua mọi giới hạn về kết xuất 3D trên trình duyệt và công nghệ sinh hình học bằng thuật toán (procedural generation).

![Exoplanet Explorer Banner](/public/textures/sun_color.jpg) *(Thay thế bằng ảnh chụp màn hình)*

## 🚀 Tính Năng Chính

*   **Vũ trụ 3D Tương tác:** Khám phá hơn 5,700 hành tinh được render theo thời gian thực (60-165 FPS). Bay lượn mượt mà giữa các hệ sao bằng thuật toán nội suy (interpolation) camera siêu việt.
*   **Shader Đồ họa Chuẩn AAA:** Shader WebGL GLSL tự viết dành riêng cho Hành tinh khí (gas giants với mây xoáy), Hành tinh dung nham (lava planets phát sáng nứt nẻ), và Hành tinh đá (địa hình Simplex noise) - tất cả đều được tính toán theo thời gian thực (dynamically) dựa vào dữ liệu của NASA.
*   **Tổng hợp Âm thanh Môi trường (Synthesizer):** Không dùng file mp3 có sẵn! Âm thanh được tổng hợp (synth) bằng Web Audio API. Cao độ âm thanh (pitch) tỷ lệ nghịch với bán kính hành tinh, bộ lọc cắt tần số (filter cutoff) tỷ lệ thuận với nhiệt độ hành tinh.
*   **Dữ liệu thực từ NASA & Web Worker:** Tải xuống và xử lý bộ dữ liệu khổng lồ từ NASA TAP API thông qua một Web Worker chạy ngầm, đảm bảo giao diện (UI) không bao giờ bị đứng máy.
*   **Phân tích Khả năng sống được:** Tính toán Điểm Sống Được (0-100) dựa trên nhiệt độ cân bằng và bán kính hành tinh, đi kèm với vòng sáng Vùng Sống Được (Habitable Zone).
*   **Đa ngôn ngữ (i18n):** Hỗ trợ Tiếng Anh và Tiếng Việt, kết hợp một thuật toán tự động dịch các thuật ngữ chuyên ngành Thiên văn học vô cùng phức tạp (ví dụ: *Radial Velocity* -> *Vận tốc xuyên tâm*).
*   **PWA - Cài đặt như một Ứng dụng:** Hỗ trợ cài đặt trên Điện thoại và Máy tính, hoạt động siêu mượt với trải nghiệm như Native App.

## 🛠️ Công Nghệ Sử Dụng

*   **Frontend Framework:** React 18, TypeScript, Vite
*   **3D Engine:** Three.js, React Three Fiber (R3F), React Three Drei
*   **Giao diện:** Tailwind CSS, Lucide React (Biểu tượng)
*   **Quản lý Trạng thái:** Zustand
*   **Âm thanh:** Howler.js & Native Web Audio API (BiquadFilters, Oscillators)
*   **Nguồn dữ liệu:** NASA Exoplanet Archive (TAP API)

## 💻 Hướng Dẫn Chạy Cục Bộ (Local)

1.  Clone repo về máy:
    ```bash
    git clone https://github.com/yourusername/exoplanet-explorer.git
    cd exoplanet-explorer
    ```
2.  Cài đặt các gói phụ thuộc (dependencies):
    ```bash
    pnpm install
    ```
3.  Chạy server phát triển (dev server):
    ```bash
    pnpm run dev
    ```

## 🧠 Điểm Nhấn Kỹ Thuật

### Tối ưu hóa InstancedMesh
Để có thể render 5,700 hình cầu mà không làm cháy GPU, dự án tận dụng `THREE.InstancedMesh`. Việc này cho phép vẽ toàn bộ các hành tinh chỉ bằng **MỘT LẦN GỌI VẼ (Single Draw Call)**. Vùng va chạm (hit-box để dùng chuột bấm) sẽ tự động thu nhỏ lại khi bạn đang xem gần một hành tinh để tránh bấm nhầm, đồng thời vẫn giữ được khả năng bấm trúng dễ dàng khi nhìn từ xa.

### Tinh chỉnh Shader (`onBeforeCompile`)
Thay vì phải tải hàng ngàn file ảnh Texture nặng nề, ứng dụng này bơm thẳng các thuật toán nhiễu (Simplex 3D Noise) vào trong bộ Shader `MeshStandardMaterial`. Nhờ vậy, ánh sáng, đổ bóng, các hiệu ứng thị giác rực rỡ đều được tính toán bằng Toán học trực tiếp trên Card Đồ Họa (GPU). Kết quả: Dung lượng tải (bundle size) siêu nhẹ và hiệu năng đồ họa khủng khiếp.

### Sửa lỗi Race-Condition của React StrictMode
Đã triển khai cơ chế Promise Caching toàn cục để ngăn chặn việc tải đôi (double-fetching) API của NASA khi React 18 Strict Mode chạy chu kỳ mount, giúp tiết kiệm băng thông và ngăn chặn lỗi quá tải API.

---
*Dự án được tạo ra bằng tất cả niềm đam mê, kết hợp giữa Thiên văn học, Trực quan hóa dữ liệu và Đồ họa web đỉnh cao.*
