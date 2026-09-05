# 🌌 Bản Đồ Ngoại Hành Tinh 3D

[![CI](https://github.com/CaoDuyTung86/exoplanet-explorer/actions/workflows/ci.yml/badge.svg)](https://github.com/CaoDuyTung86/exoplanet-explorer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Bản đồ sao 3D tương tác hiển thị toàn bộ ngoại hành tinh đã được xác nhận trong NASA Exoplanet
Archive (~6.300 thế giới), render bằng WebGL ngay trên trình duyệt. Bay giữa các hệ sao, lọc
theo thông số vật lý, và so sánh với chính Hệ Mặt Trời của chúng ta.

*[Read in English →](README.md)*

<img width="675" alt="Exoplanet Explorer banner" src="https://github.com/user-attachments/assets/a48d002b-8743-443f-af0b-f397a3fd9d6b" />

## 🚀 Tính năng

- **Vũ trụ 3D tương tác** — toàn bộ hành tinh được vẽ trong một draw call duy nhất bằng
  `THREE.InstancedMesh`, camera nội suy mượt khi bay tới một hệ sao, và chế độ spectate bám
  theo hành tinh trong lúc nó chuyển động.
- **Shader thủ tục (procedural)** — hành tinh khí, hành tinh dung nham và hành tinh đá được
  tô bóng bằng GLSL chèn vào `MeshStandardMaterial` qua `onBeforeCompile`, tính từ chính thông
  số NASA của hành tinh đó. Không cần texture riêng cho từng hành tinh nên bundle rất nhẹ.
- **Hệ Mặt Trời làm hệ quy chiếu** — Mặt Trời và 8 hành tinh đặt tại gốc tọa độ với texture
  thật, cho người xem một thang đo quen thuộc để đối chiếu mọi ngoại hành tinh.
- **Chấm điểm khả năng sống** — thang 0–100 dựa trên nhiệt độ cân bằng, bán kính, khối lượng
  và loại quang phổ của sao chủ, kèm vòng Habitable Zone phát sáng.
- **Pipeline xử lý dữ liệu phía server** — chuẩn hóa, chấm điểm sống được và chiếu tọa độ 3D
  chỉ chạy một lần lúc ingest, không chạy lại trong trình duyệt của từng người. Client nhận
  binary đóng gói và dựng typed-array view từ đó, không parse JSON trên đường găng.
- **Tổng hợp âm thanh môi trường** — oscillator và biquad filter của Web Audio tạo ra một
  drone riêng cho mỗi hành tinh: cao độ theo bán kính, tần số cắt theo nhiệt độ.
- **Bộ lọc và chế độ bảng** — bán kính, khối lượng, nhiệt độ, khoảng cách, chu kỳ quỹ đạo,
  phương pháp khám phá, lớp quang phổ, năm khám phá, kèm bảng dữ liệu ảo hóa (virtualised).
- **Tài khoản** — đăng nhập để lưu hành tinh đã đánh dấu và các bộ lọc đặt tên lên máy chủ
  thay vì nằm trong một trình duyệt. Phiên đăng nhập là token ngẫu nhiên đặt trong cookie
  httpOnly, database chỉ giữ bản băm, nên đăng xuất là thu hồi thật.
- **Presence thời gian thực** — WebSocket cho biết ai đang ở trên bản đồ và đang xem hành
  tinh nào; bấm vào một người là bay tới đó. Redis pub/sub chuyển sự kiện giữa các tiến
  trình API, còn TTL kèm heartbeat xử lý trường hợp tab bị tắt đột ngột.
- **Thế giới tương đồng nhất** — mỗi hành tinh được rút gọn thành bốn con số đã chuẩn hóa
  (bán kính, khối lượng, bức xạ nhận được, nhiệt độ sao mẹ) và hàng xóm gần nhất được tìm
  bằng chỉ mục GiST k-NN trên kiểu `cube` của Postgres, mất khoảng một mili-giây. Chiều
  nào kho dữ liệu chưa từng đo thì nội suy về trung bình quần thể và **ghi rõ là nội
  suy**, để số ước lượng không bao giờ bị trưng ra như số đo. Hỏi nó về Trái Đất, nó trả
  lời Kepler-452 b.
- **Tìm kiếm tha lỗi gõ** — `kepler 452b`, `KEPLER-452 B` hay `keplr-452 b` đều ra
  Kepler-452 b. Dấu câu bị gấp bỏ ngay trong một cột generated nên không bao giờ tới được
  phép so sánh; lỗi gõ thật thì do chỉ mục GIN `pg_trgm` bắt. Điểm của một khớp gần đúng
  bị chặn dưới dải khớp nguyên văn, nên nó chỉ thêm kết quả vào cuối danh sách chứ không
  đẩy được thứ bạn thật sự gõ xuống dưới. Bấm Ctrl/⌘+K ở bất cứ đâu.
- **Chia sẻ khung nhìn** — một nút biến bộ lọc cùng thứ bạn đang xem thành một link mười
  ký tự. Slug là digest của chính khung nhìn chứ không phải chuỗi ngẫu nhiên, nên chia sẻ
  cùng một cảnh hai lần ra cùng một link, và kéo con trượt rồi trả về chỗ cũ thì nhận lại
  đúng link ban đầu. Chỉ những gì bạn thật sự đổi mới được lưu: bộ lọc để nguyên mặc định
  sẽ đi theo mặc định về sau chứ không bị đóng băng. Dán vào khung chat, link mở ra thành
  một **"hộ chiếu hành tinh"** — tấm thẻ do API vẽ thẳng từ hàng dữ liệu: thế giới đó được
  chiếu sáng bằng đúng màu của nó, sáu con số đo, và điểm sống được; chỗ nào kho dữ liệu
  không có số thì để dấu gạch chứ không bịa ra.
- **Anh / Việt** — có từ điển riêng cho thuật ngữ thiên văn
  (*Radial Velocity* → *Vận tốc xuyên tâm*).

## 🛠️ Công nghệ

| Tầng | Lựa chọn |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8 |
| 3D | Three.js, React Three Fiber, Drei, postprocessing |
| Routing / data | TanStack Router, TanStack Query, TanStack Virtual |
| State | Zustand |
| Giao diện | Tailwind CSS v4, Lucide icons |
| Âm thanh | Howler.js + Web Audio API thuần |
| Đa ngôn ngữ | i18next / react-i18next |
| PWA | vite-plugin-pwa |
| **API** | **Python 3.13, FastAPI, asyncpg, numpy, argon2** |
| **Database** | **Postgres 17 (Docker Compose), extension `cube` cho k-NN** |
| **Thời gian thực** | **WebSocket + Redis 8 pub/sub** |
| Nguồn dữ liệu | [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/) TAP API (`pscomppars`) |

## 💻 Chạy ở máy

```bash
git clone https://github.com/CaoDuyTung86/exoplanet-explorer.git
```

```bash
cd exoplanet-explorer && pnpm install
```

Khởi động Postgres và Redis rồi chạy ingest lần đầu (lệnh này áp dụng luôn migration):

```bash
docker compose up -d db redis
```

```bash
cd server && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements-dev.txt
```

```bash
cd server && .venv/Scripts/python -m app.ingest
```

Sau đó chạy API và frontend:

```bash
cd server && .venv/Scripts/python -m uvicorn app.main:app --reload
```

```bash
pnpm dev
```

Trên Linux/macOS dùng `.venv/bin/python` thay cho `.venv/Scripts/python`.

Frontend chạy ở cổng 3001 và proxy `/api/v1` sang API nên không cần biến môi trường nào.
Chấm tròn cạnh số hành tinh trên header: **xanh lá** = dữ liệu từ API, **hổ phách** = đang
chạy ở chế độ degraded.

**Frontend vẫn chạy độc lập được** khi không có backend: nó tự chuyển sang gọi thẳng NASA
và tính toán ngay trên trình duyệt, đồng thời hiện banner báo rõ.

Redis cũng là tùy chọn. Không có Redis thì presence vẫn hoạt động trong phạm vi một tiến
trình API; API ghi log chế độ đang chạy và báo lại ở `GET /health`.

| Lệnh | Công dụng |
| --- | --- |
| `pnpm dev` | Vite dev server |
| `pnpm build` | Type-check rồi build production |
| `pnpm tsc` | Chỉ type-check |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |
| `pytest -q` (trong `server/`) | Bộ test của API |

Các script trong `scripts/` là công cụ sinh asset dùng một lần, không nằm trong quy trình build:
`generate_icons.cjs` render bộ icon PNG bằng thuật toán, `generate_sounds.cjs` tổng hợp hiệu ứng
âm thanh ra WAV, `download_textures.cjs` tải texture Hệ Mặt Trời.

## 🧠 Ghi chú kỹ thuật

**InstancedMesh.** Vẽ ~6.300 hình cầu thành từng mesh riêng nghĩa là ~6.300 draw call. Thay vào
đó một instanced mesh duy nhất mang ma trận và màu cho từng instance. Hit-box raycast thu nhỏ
lại khi đang spectate để hành tinh ở gần không "nuốt" cú click nhắm vào hành tinh phía sau.

**Vật liệu thủ tục.** Thay vì tải hàng nghìn ảnh texture, Simplex noise 3D được chèn thẳng vào
shader chunk của standard material. Ánh sáng, bóng đổ và chi tiết bề mặt được tính trên GPU từ
bán kính, nhiệt độ và mật độ của hành tinh.

**Double-fetch do StrictMode.** StrictMode ở chế độ dev mount effect hai lần, khiến catalog bị
gọi hai lần và thỉnh thoảng dính rate limit của NASA. Một promise cache ở cấp module trong
`nasaApi.ts` gộp các lời gọi đồng thời về chung một request đang bay.

## 🛰️ Kiến trúc

Trình duyệt không nói chuyện với NASA. Một job ingest định kỳ kéo catalog về, tính sẵn mọi
trường dẫn xuất một lần rồi lưu vào Postgres; API phục vụ lại dưới dạng binary đóng gói mà
bộ render nạp gần như thẳng lên GPU.

```
ingest ──► NASA TAP ──► derive ──► Postgres ──► FastAPI ──► browser
                                                  │
                              /v1/catalog.bin  ───┘  tọa độ, màu, cột số
                              /v1/catalog/meta ───►  tên và cột chuỗi, tải lười
```

Đo trên catalog thật (6.287 hành tinh):

| | Trước: JSON của NASA tải ở client | Sau: `catalog.bin` |
| --- | --- | --- |
| Payload thô | 2.431,8 KB | **368,4 KB** |
| Qua dây (gzip) | 330,3 KB | **226,5 KB** |
| Việc ở client | `JSON.parse` + ~6.300 object + lượng giác từng hành tinh | tạo typed-array view |
| Truy cập lại | tải lại toàn bộ | **`304`, 0 byte** |

Việc gỡ CORS proxy công cộng khỏi đường production quan trọng không kém phần dung lượng:
app không còn phụ thuộc một bên thứ ba không liên quan để tải chính dữ liệu của mình.

Xem [`server/README.md`](server/README.md) để biết chi tiết API, định dạng binary và schema.

## 🗺️ Lộ trình

Giai đoạn 1 và 2 (dọn dẹp, và pipeline ingest + API) đã xong, Giai đoạn 3 cũng gần trọn:
tài khoản, presence realtime, cỗ máy thời gian, tìm hành tinh tương đồng và tìm kiếm tha
lỗi gõ, permalink chia sẻ và tấm thẻ xem trước mà link mở ra. Còn lại ở giai đoạn này là
"tour" tự tạo — vốn chỉ là một danh sách permalink có thứ tự cộng lời dẫn. Giai
đoạn 4 là hạ tầng — trước hết là chạy ingest tự động, vì lịch sử đo đạc chỉ dài thêm khi
ingest thật sự chạy.

**Xem [ROADMAP.md](ROADMAP.md) để biết kế hoạch từng giai đoạn và tiến độ hiện tại.**

## 📄 Giấy phép

MIT — xem [LICENSE](LICENSE).

Dữ liệu ngoại hành tinh từ [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/),
vận hành bởi Caltech theo hợp đồng với NASA. Texture Hệ Mặt Trời từ
[Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0).
