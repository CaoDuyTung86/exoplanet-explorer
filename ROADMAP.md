# 🗺️ Roadmap & Tiến độ — Exoplanet Explorer

> **File này dùng để mang ngữ cảnh sang một phiên chat mới.**
> Nó chứa: dự án là gì, kiến trúc hiện tại, các quyết định đã chốt, việc đã làm và việc còn lại.
> Khi mở chat mới, chỉ cần nói *"đọc ROADMAP.md rồi làm tiếp Giai đoạn X"* là đủ.
>
> **Cập nhật lần cuối:** 2026-09-04 · **Đã xong:** Giai đoạn 1, 2, và phần realtime +
> tài khoản của Giai đoạn 3 · **Tiếp theo:** phần còn lại của Giai đoạn 3

---

## 1. Dự án là gì

Bản đồ sao 3D của ~6.300 ngoại hành tinh từ NASA Exoplanet Archive, chạy trên WebGL.
Người dùng bay giữa các hệ sao, lọc theo thông số vật lý, so sánh với Hệ Mặt Trời.

**Mục tiêu dài hạn:** biến nó từ một SPA frontend thuần thành **hệ thống full-stack có
backend, database, pipeline và hạ tầng của riêng mình** — vì đó là hướng người làm dự án
muốn đi sâu.

Repo: `github.com/CaoDuyTung86/exoplanet-explorer` · License MIT

---

## 2. Kiến trúc hiện tại

```
                 ┌────────────────────────────────────┐
  python -m      │  Ingest  (server/app/ingest.py)    │
  app.ingest ───►│  NASA TAP → derive → diff → upsert │
  (thủ công)     └──────────────┬─────────────────────┘
                                ▼
                     ┌─────────────────────┐      ┌──────────────────┐
                     │  Postgres 17        │      │  Redis 8         │
                     │  (Docker, cổng 5433)│      │  (cổng 6380)     │
                     │  planets            │      │  presence:peer:* │
                     │  ingest_runs        │      │  presence:index  │
                     │  planet_history     │      │  pub/sub events  │
                     │  users · sessions   │      │  rate-limit keys │
                     │  bookmarks          │      └────────┬─────────┘
                     │  saved_filters      │               │
                     └──────────┬──────────┘               │
                                ▼                          ▼
                  ┌────────────────────────────────────────────────┐
  Browser ──────► │  FastAPI  (cổng 8000)                          │
  (Vite proxy     │  /v1/catalog.bin   binary                      │
   /api/v1,       │  /v1/catalog/meta  chuỗi                       │
   ws: true)      │  /v1/stats         SQL agg                     │
                  │  /v1/auth/*        cookie phiên (opaque token) │
                  │  /v1/me/*          bookmark · bộ lọc đã lưu    │
                  │  /v1/ws/presence   WebSocket                   │
                  │  /v1/planets/{id}/similar  k-NN trên cube      │
                  │  ETag · Cache-Control · gzip                   │
                  └────────────────────────────────────────────────┘
                                ▼
              decodeCatalog() → typed arrays → InstancedMesh
```

**Vì sao presence cần Redis:** một WebSocket chỉ nằm trong *một* tiến trình. Có 2 tiến
trình API sau load balancer thì người ở tiến trình A không thấy người ở tiến trình B.
Redis pub/sub là sợi dây nối: mọi tiến trình publish vào cùng một kênh và cũng subscribe
kênh đó, nên nhận được **tất cả** sự kiện — kể cả của chính nó — rồi đẩy xuống socket cục
bộ. Không có Redis thì hub tự lùi về registry in-memory (đúng, nhưng chỉ trong 1 tiến
trình) và ghi rõ điều đó ở log lẫn `GET /health`.

**Fallback (có báo cho người dùng):** API chết → gọi thẳng NASA + Web Worker (banner hổ
phách) → cả hai chết → 7 hành tinh curated (banner hổ phách). Không còn thất bại im lặng.

### File quan trọng

| Đường dẫn | Vai trò |
| --- | --- |
| `server/app/ingest.py` | NASA TAP → chuẩn hóa → ghi lịch sử thay đổi → upsert |
| `server/app/transform.py` | Chấm điểm sống được, phân loại, màu, chiếu 3D (port từ TS) |
| `server/app/catalog.py` | Encoder binary + dictionary-encode phần chuỗi |
| `server/app/main.py` | FastAPI routes + cache catalog trong RAM |
| `server/migrations/001_init.sql` | Schema |
| `src/features/explorer/services/catalogApi.ts` | Decoder binary phía client |
| `src/features/explorer/services/nasaApi.ts` | Đường legacy (fallback) + `processExoplanets` |
| `src/features/explorer/index.tsx` | Thứ tự fallback + banner cảnh báo |
| `src/features/explorer/components/PlanetCloud.tsx` | InstancedMesh + shader thủ tục |
| `server/app/security.py` | Băm mật khẩu, sinh token phiên, làm sạch input (không I/O) |
| `server/app/auth.py` | Users + sessions trong Postgres, dependency của FastAPI |
| `server/app/presence.py` | Hub presence: Redis pub/sub, fallback in-memory, sweeper TTL |
| `server/app/routes_account.py` | `/v1/auth/*`, `/v1/me/bookmarks`, `/v1/me/filters` |
| `server/app/routes_presence.py` | WebSocket `/v1/ws/presence` + snapshot `/v1/presence` |
| `server/migrations/002_accounts.sql` | users · sessions · bookmarks · saved_filters |
| `src/features/explorer/stores/accountStore.ts` | Trạng thái tài khoản phía client |
| `src/features/explorer/stores/presenceStore.ts` | Client WebSocket + reconnect backoff |
| `src/features/explorer/components/AccountMenu.tsx` | Đăng nhập/đăng ký + danh sách đã lưu |
| `src/features/explorer/components/PresenceBar.tsx` | Ai đang online, đang xem hành tinh nào |
| `server/app/history.py` | Tái dựng lịch sử đo đạc + tổng hợp mốc thời gian (thuần, không I/O) |
| `src/features/explorer/components/TimeMachine.tsx` | Thanh tua năm, biểu đồ cột, phát lại |
| `src/features/explorer/components/PlanetRevisions.tsx` | Danh sách lần hiệu chỉnh trong thẻ chi tiết |
| `server/app/similarity.py` | Vector đặc trưng 4 chiều: log, chuẩn hóa, mặt nạ "đo thật" (thuần, không I/O) |
| `server/migrations/003_similarity.sql` | `cube` + `planet_features` + `feature_stats` |
| `src/features/explorer/components/SimilarPlanets.tsx` | Danh sách thế giới tương đồng trong thẻ chi tiết |
| `docker-compose.yml` | Postgres · Redis (+ API qua `--profile api`) |

---

## 3. "API riêng" nghĩa là gì?

Ghi lại để khỏi quên. Mẫu này gọi là **BFF — Backend For Frontend**, hay rộng hơn là
**ingest pipeline**.

Dữ liệu vẫn là của NASA, mình không bịa ra gì cả. Nhưng thay vì để trình duyệt của mỗi
người dùng gọi thẳng NASA, ta đặt một server của mình ở giữa:

1. Server **định kỳ** gọi NASA, lấy toàn bộ catalog.
2. Nó **xử lý sẵn** — chuẩn hóa, tính điểm sống được, tính tọa độ x/y/z, tính màu — rồi
   **lưu vào database của mình**.
3. Trình duyệt gọi **API của mình**, không bao giờ chạm tới NASA nữa.

| Vấn đề cũ | Sau khi có API riêng |
| --- | --- |
| NASA sập / rate limit → app hỏng | Vẫn phục vụ từ DB của mình |
| Phụ thuộc `corsproxy.io` | ✅ Đã gỡ bỏ hoàn toàn |
| Mỗi user tải 2,4 MB JSON | ✅ 368 KB binary (226 KB qua dây) |
| Mỗi máy tính lại toàn bộ điểm số | ✅ Tính 1 lần lúc ingest |
| Không thể lưu lịch sử | ✅ Có bảng `planet_history` |
| Không thể tìm kiếm nâng cao | Đã có SQL + index, sẵn sàng cho Giai đoạn 3 |

**NASA là nguồn để ingest, không phải API để gọi trực tiếp.** Đây là mẫu chuẩn công nghiệp.

---

## 4. Các giai đoạn

### ✅ Giai đoạn 1 — Dọn dẹp & làm sạch nền móng

- [x] Xóa 61 file code chết từ template `shadcn-admin` (toàn bộ `src/assets`, 18/19
      component `ui/`, `coming-soon`, `skip-to-main`, `cookies.ts`, `show-submitted-data`,
      `scratch-add-light-theme.js`, 2 script download hỏng)
- [x] Tạo lại bộ icon PWA — **file cũ là ảnh JPEG 2048×1024 đổi tên thành `.png`, hai
      file 192 và 512 byte-identical nhau, mỗi file 822 KB.** Nay là PNG thật, đúng kích
      thước (822 KB → 17 KB / 70 KB), sinh bằng `scripts/generate_icons.cjs`
- [x] Thêm `favicon-32.png` + `apple-touch-icon.png`, khai báo trong `index.html`
- [x] Sửa manifest PWA: tách `purpose: any` và `purpose: maskable`
- [x] Xóa 4 file `.mp3` — chúng là **trang HTML 404** (355 byte) do script tải hụt
- [x] `.env.example`: bỏ `VITE_CLERK_PUBLISHABLE_KEY` (Clerk chưa từng được nối)
- [x] `.gitignore`: bỏ 2 dòng ignore file template, thêm `.specstory/` (transcript chat AI)
- [x] Viết lại `README.md` + `README-vi.md` cho đúng sự thật (React 19 chứ không phải 18,
      sửa markdown ảnh banner hỏng, URL clone đúng repo)

### ✅ Giai đoạn 2 — API riêng + ingest pipeline

- [x] Service API: **Python + FastAPI** (`server/`), asyncpg, numpy, httpx
- [x] Postgres 17 qua Docker Compose (cổng host **5433** để tránh đụng Postgres local)
- [x] Schema: `planets`, `ingest_runs`, `planet_history`, `schema_migrations`
- [x] Migration runner tự viết (~20 dòng, SQL thuần, 1 transaction/file)
- [x] Ingest job: NASA TAP → derive → **diff với dữ liệu cũ** → upsert + ghi `planet_history`
- [x] Port `processExoplanets()` từ TS sang `server/app/transform.py`, **giữ nguyên công
      thức bit-for-bit** để bản đồ không đổi hình
- [x] `/v1/catalog.bin` — binary column-major, header 56 byte tự mô tả offset từng section
- [x] `/v1/catalog/meta` — phần chuỗi tách riêng, dictionary-encode
- [x] ETag + `Cache-Control: immutable` + gzip + 304 (lượt truy cập lại tải **0 byte**)
- [x] `/v1/stats` — aggregate tính bằng SQL thay vì quét 6.287 phần tử ở client
- [x] Decoder client `catalogApi.ts` — typed-array views, không `JSON.parse`
- [x] **Gỡ `corsproxy.io`** khỏi đường production
- [x] **Gỡ fallback im lặng** → banner cảnh báo + chấm trạng thái đổi màu theo nguồn dữ liệu
- [x] 52 test pytest (domain logic + wire format), không cần database
- [x] Dockerfile multi-stage cho API, chạy non-root, có healthcheck
- [x] CI: 3 job — frontend (lint/tsc/build), api (pytest), api-image (docker build)
- [x] Đo và ghi lại con số before/after ⬇️

#### 📊 Số đo thật (6.287 hành tinh, đo ngày 2026-09-03)

| | Cũ: NASA JSON | Mới: `catalog.bin` |
| --- | --- | --- |
| Raw | **2.431,8 KB** | **368,4 KB** (6,6× nhỏ hơn) |
| Qua dây (gzip) | 330,3 KB | 226,5 KB |
| Việc ở client | `JSON.parse` 2,4 MB + tạo ~6.300 object + lượng giác từng hành tinh | tạo typed-array view |
| Truy cập lại | tải lại toàn bộ | **304, 0 byte** |
| Phần chuỗi | nằm trong cùng payload | 68,1 KB gzip, tải riêng, lười |

Ingest thật: 6.278 dòng từ NASA + 9 thiên thể Hệ Mặt Trời = 6.287 rows, **8,9 giây**.

### 🟡 Giai đoạn 3 — Tính năng chỉ backend mới làm được ⬅️ *đang làm*

#### ✅ Đã xong (2026-09-04)

- [x] **Presence realtime qua WebSocket** — Redis pub/sub + presence TTL
- [x] **Auth + tài khoản: bookmark, bộ lọc đã lưu**

Chi tiết:

- [x] Redis 8 vào Docker Compose (cổng host **6380**, không persist — presence là dữ liệu
      phù du, `--save '' --appendonly no`)
- [x] Migration `002_accounts.sql`: `users`, `sessions`, `bookmarks`, `saved_filters`
- [x] **Phiên = opaque token, không phải JWT.** 32 byte từ `secrets.token_urlsafe` gửi cho
      trình duyệt qua cookie httpOnly/SameSite=Lax; database chỉ giữ **SHA-256** của token
- [x] Mật khẩu băm bằng **Argon2id**; tham số nằm trong chuỗi hash nên nâng cấp sau này
      chỉ cần re-hash lúc đăng nhập, không vô hiệu hóa tài khoản cũ
- [x] Chống dò tài khoản: sai mật khẩu và không có tài khoản trả **cùng một thông báo** và
      tốn **xấp xỉ cùng thời gian** (vẫn băm một lần khi email không tồn tại)
- [x] Rate limit đăng nhập/đăng ký: fixed window trong Redis, khóa theo IP **và** email,
      tự lùi về bộ đếm in-process khi Redis chết
- [x] WebSocket `/v1/ws/presence`: hub với 2 backend (Redis / in-memory), một queue cho
      mỗi socket nên client chậm không chặn broadcast, sweeper biến TTL hết hạn thành
      sự kiện `leave`
- [x] **Client không được tự đặt tên mình.** Khách ẩn danh nhận callsign suy ra từ peer id;
      người đã đăng nhập lấy tên từ cookie phiên đi kèm lúc bắt tay WebSocket
- [x] Frontend: menu tài khoản, nút bookmark trên thẻ chi tiết, mục "bộ lọc đã lưu" trong
      sidebar, thanh presence (bấm vào một người là bay tới hành tinh họ đang xem)
- [x] Presence tự kết nối lại khi đăng nhập/đăng xuất, có exponential backoff khi API chết
- [x] Vite proxy bật `ws: true`, thêm biến `API_PROXY_TARGET` để đổi cổng API khi 8000 bận
- [x] **Sống sót qua Redis restart:** vòng subscribe tự resubscribe với backoff. Trước khi
      sửa, `pubsub.listen()` ném lỗi là task chết luôn — API vẫn phục vụ WebSocket bình
      thường nhưng **âm thầm không forward gì nữa**, kiểu hỏng tệ nhất vì nhìn ngoài vẫn ổn
- [x] Redis chết giữa chừng: `/v1/presence` trả `degraded: true` thay vì 500
- [x] Thêm **45 test** (tổng 97): `test_security.py`, `test_presence.py`

##### Time machine (2026-09-04)

- [x] `GET /v1/timeline` — số hành tinh tìm ra từng năm, cộng dồn, phương pháp áp đảo, và
      hành tinh đáng sống nhất của năm đó. Tính bằng SQL (`mode() WITHIN GROUP`,
      `DISTINCT ON`) thay vì quét mảng ở client.
- [x] **Điền năm trống.** Postgres chỉ trả về năm có dữ liệu; 1993 thật sự không có phát
      hiện nào. Nếu để nguyên thì thanh tua nhảy cóc và năm trống trông như chưa từng tồn
      tại — nên mọi năm trong khoảng đều có một dòng, cộng dồn giữ nguyên.
- [x] `GET /v1/planets/{id}/history` — **thứ NASA không trả lời được.** TAP API chỉ phục
      vụ hiện tại: bán kính được tinh chỉnh từ 2,1 xuống 1,8 R⊕ thì con số cũ biến mất bên
      họ. Ingest từ Giai đoạn 2 đã giữ lại mọi giá trị bị ghi đè nên phát lại được.
- [x] **Đảo chiều bản ghi.** `planet_history.previous` lưu giá trị *trước khi* lần chạy đó
      ghi đè — rẻ khi ghi nhưng ngược chiều khi đọc. Giá trị *sau* lần chạy N chính là
      snapshot mà lần chạy N+1 lưu lại; riêng lần gần nhất mới lấy từ hàng hiện tại. Đọc
      hàng hiện tại cho mọi lần sẽ báo sai: mỗi lần chạy cũ trông như nhảy thẳng tới số
      hôm nay.
- [x] Thanh tua + biểu đồ cột theo năm (thang căn bậc hai — riêng 2014 nhiều hơn cả 15 năm
      đầu cộng lại, để thang tuyến tính thì mọi năm trước Kepler chỉ là một vạch vô hình)
- [x] Phát lại bằng `requestAnimationFrame` với bộ tích lũy theo đồng hồ thực, không dùng
      `setInterval`: tab chạy nền bị bóp cả hai, nhưng bộ tích lũy quay lại đúng năm mà
      thời gian đã trôi chỉ tới, thay vì bò qua một đống tick tồn đọng.
- [x] **Không nhét năm vào `applyFilters`.** Bộ lọc trả lời "tôi quan tâm hành tinh nào",
      dòng thời gian trả lời "trong số đó cái nào đã được biết". Gộp vào sẽ quét lại 6.287
      phần tử mỗi bước animation. Thay vào đó `timelineOrder` sắp xếp sẵn theo năm một
      lần, nên mỗi bước chỉ là một phép tìm nhị phân cộng một lát cắt tiền tố.
- [x] Hành tinh tìm ra đúng năm đang xem được phóng to 2,4× và pha trắng, để mỗi bước là
      một sự kiện chứ không phải một con số lặng lẽ đổi
- [x] Hệ Mặt Trời miễn trừ khỏi dòng thời gian (giống như đã miễn trừ khỏi `applyFilters`)
      — 1992 không nên là khoảng không có cả Trái Đất
- [x] Hành tinh không rõ `disc_year` xếp vào năm cuối cùng thay vì biến mất hẳn
- [x] Mục "Lịch sử đo đạc" trong thẻ chi tiết; cơ sở dữ liệu còn non thì nói thẳng là chưa
      có bản hiệu chỉnh nào, chứ không hiện một khung rỗng
- [x] Phím tắt: dấu cách chạy/dừng, mũi tên trái/phải lùi/tiến một năm
- [x] Thêm **23 test** (tổng 120): `test_history.py`

##### Tìm hành tinh tương đồng (2026-09-04)

- [x] `GET /v1/planets/{id}/similar` — **k-NN trên `cube`, không phải pgvector.**
      `pg_available_extensions` xác nhận `postgres:17-alpine` có sẵn `cube` (1.5), nên
      không phải đổi base image lẫn khởi tạo lại volume dữ liệu chỉ để có 4 chiều.
      pgvector đáng giá ở 768 chiều với HNSW; ở 4 chiều nó là thủ tục thừa.
- [x] **Vector 4 chiều:** bán kính, khối lượng, insolation, nhiệt độ sao mẹ. Cố tình
      **không** đưa chu kỳ quỹ đạo vào — insolation vốn đã suy ra từ quỹ đạo và ngôi sao,
      thêm chu kỳ là đếm cùng một sự thật hai lần.
- [x] **log10 rồi mới chuẩn hóa.** Ba đại lượng đầu là tỉ số so với Trái Đất và trải dài
      nhiều bậc độ lớn nên bước có ý nghĩa là bước nhân; nhiệt độ sao vốn tuyến tính nên
      giữ nguyên. Không chia cho độ lệch chuẩn thì vector chỉ còn là nhiệt độ sao đội mũ.
- [x] **Bảng riêng `planet_features`, không phải cột trong `planets`.** `cube` là kiểu
      contrib, asyncpg không có codec cho nó — thêm một cột như vậy là mọi `SELECT *` trên
      `planets` ngừng giải mã được. Tách ra cũng nói đúng bản chất: đây là cấu trúc chỉ
      mục suy ra từ hàng dữ liệu, không phải thuộc tính của hành tinh.
- [x] **Giá trị thiếu nằm ở trung bình quần thể** — lựa chọn trung tính, không bịa ra
      giống nhau lẫn khác nhau. Nhưng `feature_mask` ghi lại chiều nào *đo thật*, API trả
      kèm, và `ratios` chỉ so hai con số cùng đo được. Số nội suy không bao giờ được trưng
      ra như số đo.
- [x] Hàng xóm bắt buộc phải đo được **mọi chiều mà hành tinh đang xem đo được**
      (`feature_mask & $mask = $mask`), nếu không một hành tinh chưa từng cân khối lượng
      sẽ nằm ở trung bình trên trục đó và trở thành "rất giống" mọi thứ tầm thường.
- [x] Hành tinh đo được **dưới 2/4 chiều** thì không có hàng trong `planet_features` —
      "không có trong bảng" và "không xếp hạng được" là cùng một sự thật thay vì hai.
- [x] Chỉ mục GiST: `EXPLAIN ANALYZE` xác nhận `Index Scan using planet_features_vec_idx`
      với `Order By: feature_vec <-> ...`, **1,2 ms** cho 8 hàng xóm gần nhất.
- [x] `feature_stats` lưu mean/stddev từng chiều **theo từng lần ingest** — không có nó
      thì một năm sau các con số trong `feature_vec` là chữ tượng hình.
- [x] Hệ Mặt Trời **không** tham gia tính thống kê (9 hàng do ta tự gieo, không phải quan
      trắc) nhưng **có** trong kết quả: "ngoại hành tinh nào giống Trái Đất nhất" là câu
      hỏi mà cái khung tham chiếu này sinh ra để trả lời. Kiểm chứng: Kepler-452 b, tau
      Cet h, Kepler-1126 c nằm trong top 8 của Trái Đất.
- [x] `insolation` của Hệ Mặt Trời được tính lại từ sao + quỹ đạo khi cột lưu trống, nếu
      không Trái Đất sẽ bị nội suy đúng cái đại lượng quan trọng nhất của nó
- [x] Thẻ chi tiết: thanh %, nhãn tỉ số ("1,05× bán kính") — phần người đọc kiểm chứng
      được — và bấm để bay tới. Hàng xóm đang bị bộ lọc ẩn thì gắn nhãn *bị lọc bỏ* thay
      vì lặng lẽ đưa máy quay tới chỗ trống
- [x] Thêm **19 test** (tổng 139): `test_similarity.py`

#### 🔜 Còn lại của Giai đoạn 3

- [ ] Search server-side bằng `pg_trgm` (đã có sẵn trong image, kiểm tra cùng lúc với
      `cube`); phân trang cho DataTable
- [ ] Permalink chia sẻ: filter + vị trí camera + hành tinh đang chọn → short URL
      (id đã là slug ổn định nên link sẽ không mục)
- [ ] OG image render phía server → link share hiện "hộ chiếu hành tinh"
- [ ] "Tour" tự tạo (phần còn lại của mục tài khoản)

### 🔜 Giai đoạn 4 — Hạ tầng

- [ ] **Tự động hóa ingest** — hiện vẫn phải chạy tay `python -m app.ingest`.
      Cần cron job / APScheduler / GitHub Actions schedule.
      *Giờ đã có giá trị cụ thể:* "Lịch sử đo đạc" của cỗ máy thời gian chỉ dài thêm khi
      có lần chạy thứ hai trở đi. Không chạy đều thì mục đó vĩnh viễn rỗng.
- [ ] **Auth cho `POST /v1/admin/ingest`** — đang mở toang, chỉ an toàn ở localhost
- [ ] Đưa `public/textures/` (6,1 MB) + `public/sounds/` lên object storage (S3/R2) + CDN
- [ ] Push image lên GHCR, preview environment mỗi PR, deploy theo tag
- [ ] Giảm image API (416 MB — numpy + python-slim; thử `python:3.13-alpine` hoặc
      multi-stage triệt để hơn)
- [ ] Bundle-size budget + Lighthouse CI
- [ ] Observability: OpenTelemetry → Prometheus/Grafana. Trace ingest job, p95 API, và
      **beacon FPS/drawcall từ client thật** → dashboard hiệu năng theo GPU/thiết bị
- [ ] Rate limit + Redis cache
- [ ] Terraform cho phần cloud
- [ ] Public API có OpenAPI docs (FastAPI đã tự sinh sẵn ở `/docs`)

### 🔜 Giai đoạn 5 — Chất lượng

- [x] ~~Test cho pure function~~ — 52 test đã có ở `server/tests/`
- [ ] Test phía frontend: decoder `catalogApi.ts` và `applyFilters` (chưa có test JS nào)
- [ ] Playwright smoke test: load → click hành tinh → mở panel chi tiết
- [ ] Error boundary cho cây React
- [ ] **Kiểm chứng lại công thức habitability** — nên dùng `insolation` (đã lưu sẵn) thay
      vì chỉ dựa vào `pl_eqt`. Cố tình tách khỏi Giai đoạn 2 để không lẫn hai thay đổi.

---

## 5. Nhật ký quyết định

| Ngày | Quyết định | Lý do |
| --- | --- | --- |
| 2026-09-03 | Giữ `.wav`, xóa `.mp3` trong `public/sounds/` | 4 file `.mp3` chỉ 355 byte — chúng là **trang HTML 404** do `download_sounds.cjs` không kiểm tra status code. `.wav` mới là audio thật và `audio.ts` đang trỏ vào đó |
| 2026-09-03 | Xóa 18/19 component `src/components/ui/` | Chỉ `sonner.tsx` được dùng. `components.json` vẫn còn nên thêm lại bằng `pnpm dlx shadcn@latest add <tên>` |
| 2026-09-03 | Sinh icon bằng script thay vì ảnh tĩnh | Không có sharp/ffmpeg; encoder PNG thuần Node vừa tái lập được vừa là mẩu code hay |
| 2026-09-03 | **Python + FastAPI** cho API | Người dùng chọn. Hợp với xử lý dữ liệu khoa học (numpy làm encoder binary rất gọn), OpenAPI tự sinh |
| 2026-09-03 | Postgres qua Docker Compose, cổng host **5433** | Tránh đụng Postgres có sẵn trên máy. Đúng hướng thực hành hạ tầng |
| 2026-09-03 | **id = slug từ tên hành tinh**, không phải `exo-${index}` | Index đổi mỗi khi NASA thêm hành tinh gần hơn → mọi link đã lưu sẽ mục. Tên trong `pscomppars` là duy nhất và ổn định |
| 2026-09-03 | Giữ công thức habitability **y hệt bản TS** | Chuyển việc tính sang server và đổi mô hình khoa học là hai thay đổi khác nhau; gộp lại thì không biết bản đồ đổi vì lý do nào |
| 2026-09-03 | **Tách** binary và metadata thành 2 endpoint | Tên hành tinh chỉ cần khi hover/mở bảng — sau khung hình đầu rất lâu. Tách ra để bản đồ vẽ được chỉ từ binary |
| 2026-09-03 | float32 + NaN cho giá trị NULL | Đủ chính xác (7 chữ số) và map thẳng sang `Float32Array`. Có phát sinh: UI phải làm tròn khi hiển thị — đã sửa ở `DataTable` |
| 2026-09-03 | Màu lưu uint8 thay vì float32 | Giảm 4× phần màu, shader chia 255 lúc nạp, mắt không phân biệt được |
| 2026-09-03 | Migration SQL thuần, không Alembic | 4 bảng thì runner ~20 dòng là đủ và giữ SQL đọc được như SQL. Đổi sang Alembic khi schema bắt đầu biến động |
| 2026-09-03 | Giữ đường legacy gọi thẳng NASA làm fallback | Người clone repo mà chưa chạy backend vẫn xem được bản đồ — nhưng **có banner báo rõ** là đang ở chế độ degraded |
| 2026-09-04 | **Phiên đăng nhập = opaque token, không dùng JWT** | JWT không thu hồi được nếu không có denylist — mà denylist chính là bảng `sessions` này cộng thêm việc. Token ngẫu nhiên + lưu SHA-256: rò database không lộ phiên đang sống, `DELETE` một dòng là thu hồi tức thì, và tra cứu là truy vấn theo primary key |
| 2026-09-04 | Cookie httpOnly + SameSite=Lax thay vì lưu token trong `localStorage` | httpOnly nghĩa là XSS không đọc được token; SameSite=Lax chặn cookie trong POST cross-site, tức là chặn CSRF. Đổi lại phải bật `allow_credentials` trong CORS và đặt `COOKIE_SECURE=true` khi chạy HTTPS |
| 2026-09-04 | **Argon2id** (`argon2-cffi`) chứ không phải bcrypt | Memory-hard nên GPU không tăng tốc nhiều; tham số nằm ngay trong chuỗi hash nên nâng cấp về sau chỉ cần re-hash lúc đăng nhập |
| 2026-09-04 | Sai mật khẩu và không có tài khoản trả **cùng một thông báo** | Nếu khác nhau thì endpoint đăng nhập trở thành công cụ dò xem email nào đã đăng ký. Có băm giả một lần khi email không tồn tại để thời gian phản hồi không lộ ra điều đó |
| 2026-09-04 | **Server tự đặt tên hiển thị cho khách ẩn danh**, không nhận tên do client gửi | Tên này hiện cạnh tên người khác trong danh sách presence. Nếu client tự khai thì ai cũng ký tên thành người khác được. Callsign suy ra từ peer id nên reconnect vẫn giữ nguyên tên |
| 2026-09-04 | Hậu tố callsign dùng **6 ký tự hex** thay vì 4 | 4 ký tự = 16 bit; ở mức trần 200 người thì xác suất trùng ~26%, tức là hai người cùng tên trong một phòng. Test `test_different_ids_get_different_callsigns` phát hiện ra điều này |
| 2026-09-04 | Redis là **tùy chọn**, hub tự lùi về in-memory | Người clone repo chỉ chạy `docker compose up -d db` vẫn dùng được app. Chế độ degraded được ghi log và báo ở `GET /health` + `GET /v1/presence`, không im lặng |
| 2026-09-04 | Mỗi socket một `asyncio.Queue` có giới hạn, đầy thì **bỏ sự kiện** | Một client đọc chậm không được phép chặn broadcast của cả phòng. Mất một update là hỏng đúng cách: snapshot lần sau sẽ chữa lại cho client đó |
| 2026-09-04 | `saved_filters.filters` là **JSONB**, không phải 10 cột có kiểu | Hình dạng bộ lọc là chuyện của client và thay đổi mỗi lần thêm một thanh trượt. Server chỉ lưu và trả lại nguyên vẹn |
| 2026-09-04 | Áp preset là `{...DEFAULT_FILTERS, ...preset}` chứ không merge vào bộ lọc hiện tại | Nếu merge, một preset lưu 3 thanh trượt sẽ âm thầm kế thừa 7 thanh còn lại từ màn hình lúc mở — tức là không tái lập được |
| 2026-09-04 | **`cube` thay vì pgvector** cho k-NN | Roadmap ghi pgvector, nhưng `cube` đã có sẵn trong `postgres:17-alpine` và có đúng toán tử GiST k-NN cần dùng. Đổi image chỉ để lấy 4 chiều là phải khởi tạo lại volume dữ liệu, đổi lấy một thứ pgvector chỉ hơn hẳn ở quy mô 768 chiều |
| 2026-09-04 | Vector nằm ở **bảng riêng**, không phải cột trong `planets` | asyncpg không giải mã được kiểu contrib `cube`; thêm cột đó là mọi `SELECT * FROM planets` hỏng, mà `/v1/planets/{id}` và endpoint lịch sử đều đang dùng. Tách ra còn nói đúng bản chất: chỉ mục suy ra từ dữ liệu, không phải thuộc tính |
| 2026-09-04 | Chiều thiếu **nội suy về trung bình**, kèm bitmask "đo thật" | Bỏ hẳn hành tinh thiếu số liệu thì mất ~12% kho dữ liệu. Nội suy về trung bình là lựa chọn trung tính, nhưng con số nội suy không được phép trưng ra như số đo — nên mặt nạ đi kèm ra tận API và tỉ số chỉ tính khi cả hai bên cùng đo được |
| 2026-09-04 | Hệ Mặt Trời **không tính vào thống kê chuẩn hóa** nhưng **có trong kết quả** | 9 hàng do ta tự gieo không nên dịch chuyển cái trung bình mà cả kho dữ liệu được đo trên đó. Nhưng loại chúng khỏi kết quả thì mất luôn câu hỏi hay nhất mà khung tham chiếu này sinh ra để trả lời |
| 2026-09-04 | Phần trăm "độ giống" là **hàm Gauss của khoảng cách**, và khoảng cách vẫn trả kèm | Người đọc cần một thanh để so hàng nào gần hơn, nhưng con số đó không phải xác suất. Trả kèm khoảng cách thô để lúc nào cũng đối chiếu được thứ hạng với con số sinh ra nó |

---

## 6. Chạy toàn bộ hệ thống

```bash
docker compose up -d db redis
```

```bash
cd server && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements-dev.txt
```

```bash
cd server && .venv/Scripts/python -m app.ingest
```

```bash
cd server && .venv/Scripts/python -m uvicorn app.main:app --reload
```

```bash
pnpm dev
```

Frontend ở `http://localhost:3001` (Vite tự nhảy cổng khác nếu 3001 bận), API ở
`http://127.0.0.1:8000`, docs ở `/docs`. Vite proxy `/api/v1` sang API nên frontend không
cần cấu hình gì.

Kiểm tra nhanh: chấm tròn cạnh số hành tinh trên header — **xanh lá** = đang dùng API,
**hổ phách** = đang chạy degraded. Mở panel presence (biểu tượng người ở header) sẽ thấy
nhãn `redis` hoặc `memory` ở góc phải — đó là cách nhanh nhất để biết Redis đã nối chưa.

Nếu cổng 8000 đã bị chiếm, chạy API ở cổng khác rồi trỏ Vite sang đó:

```bash
cd server && .venv/Scripts/python -m uvicorn app.main:app --reload --port 8010
```

```bash
set API_PROXY_TARGET=http://127.0.0.1:8010 && pnpm dev
```

---

## 7. Sổ nợ kỹ thuật (chưa xếp lịch)

- **`planet_history` giờ đã có dữ liệu thật:** lần ingest thứ hai (2026-09-04, run 2) ghi
  **26 hành tinh** được NASA hiệu chỉnh. Nhưng 26/6.292 nghĩa là gần như hành tinh nào mở
  ra cũng vẫn thấy "chưa ghi nhận lần hiệu chỉnh nào" — mục này chỉ dày lên theo số lần
  ingest, nên vẫn phụ thuộc việc tự động hóa ở Giai đoạn 4.
- Cỗ máy thời gian rebuild ma trận instance mỗi khi đổi năm. Với lát cắt tiền tố thì số
  lượng ghi bằng đúng số hành tinh đang hiện, nhưng ở tốc độ 6× những năm cuối vẫn là
  ~6.000 lần ghi mỗi bước. Đường thật sự rẻ là animate ở shader bằng một attribute
  `discoveryYear` cộng một uniform năm hiện tại.

- **`THREE.BufferGeometry.computeBoundingSphere(): radius is NaN`** trong console. Đã
  kiểm chứng binary sạch (0 NaN trên 6.287 hành tinh) → lỗi đến từ `CursorTrail` dùng
  `Trail` của drei, có sẵn từ trước Giai đoạn 2. Vô hại về hình ảnh nhưng bẩn console.
- `decodeCatalog()` vẫn tạo 6.287 object JS. Đường zero-allocation thật sự là cho
  `PlanetCloud` đọc thẳng typed array — sẽ thu thêm được kha khá.
- `applyFilters()` quét tuyến tính 6.287 phần tử mỗi lần gõ phím — nên debounce, hoặc đẩy
  search lên server ở Giai đoạn 3.
- Ingest không xử lý trường hợp NASA đổi tên/kiểu cột; sẽ nổ chứ không degrade êm.
- `public/sounds/bgm.wav` nặng 1,7 MB không nén; cần ffmpeg để encode sang mp3/ogg.
- `favicon.svg` / `favicon_light.svg` trong `public/images/` vẫn là logo shadcn, chưa dùng.
- Route `src/routes/_authenticated/` không xác thực gì (di sản Clerk). Giữ lại vì Giai
  đoạn 3 sẽ thêm auth thật — nếu đến lúc đó vẫn không dùng thì gộp vào `routes/index.tsx`.
- README nói "60-165 FPS" — chưa từng đo thật.
- **Chưa có luồng đặt lại mật khẩu**, cũng chưa có xác minh email. Đăng ký xong là dùng
  luôn; quên mật khẩu thì mất tài khoản.
- **Rate limit tin `X-Forwarded-For`.** Đúng khi đứng sau reverse proxy của mình, sai nếu
  API bị phơi thẳng ra internet vì header đó giả được.
- Bảng `sessions` chỉ được dọn lúc khởi động API. Chạy liên tục nhiều tháng thì dòng hết
  hạn sẽ tích lại — cần một job định kỳ ở Giai đoạn 4.
- Presence chỉ phát `planetId`, chưa phát vị trí camera. Muốn thấy con trỏ của người khác
  trong không gian 3D thì cần thêm, kèm throttle vì camera đổi mỗi khung hình.
- `sessions` chưa có UI "đăng xuất khỏi mọi thiết bị" dù dữ liệu đã đủ để làm.
- Route `src/routes/_authenticated/` **vẫn** không xác thực gì. Auth đã có thật rồi nhưng
  bản đồ cố tình cho xem ẩn danh, nên thư mục này giờ chỉ còn là di sản — nên gộp vào
  `routes/index.tsx`.
