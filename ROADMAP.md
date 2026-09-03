# 🗺️ Roadmap & Tiến độ — Exoplanet Explorer

> **File này dùng để mang ngữ cảnh sang một phiên chat mới.**
> Nó chứa: dự án là gì, kiến trúc hiện tại, các quyết định đã chốt, việc đã làm và việc còn lại.
> Khi mở chat mới, chỉ cần nói *"đọc ROADMAP.md rồi làm tiếp Giai đoạn X"* là đủ.
>
> **Cập nhật lần cuối:** 2026-09-03 · **Đã xong:** Giai đoạn 1, 2 · **Tiếp theo:** Giai đoạn 3

---

## 1. Dự án là gì

Bản đồ sao 3D của ~6.300 ngoại hành tinh từ NASA Exoplanet Archive, chạy trên WebGL.
Người dùng bay giữa các hệ sao, lọc theo thông số vật lý, so sánh với Hệ Mặt Trời.

**Mục tiêu dài hạn:** biến nó từ một SPA frontend thuần thành **hệ thống full-stack có
backend, database, pipeline và hạ tầng của riêng mình** — vì đó là hướng người làm dự án
muốn đi sâu.

Repo: `github.com/CaoDuyTung86/exoplanet-explorer` · License MIT

---

## 2. Kiến trúc hiện tại (sau Giai đoạn 2)

```
                 ┌────────────────────────────────────┐
  python -m      │  Ingest  (server/app/ingest.py)    │
  app.ingest ───►│  NASA TAP → derive → diff → upsert │
  (thủ công)     └──────────────┬─────────────────────┘
                                ▼
                     ┌─────────────────────┐
                     │  Postgres 17        │  planets · ingest_runs
                     │  (Docker, cổng 5433)│  planet_history · schema_migrations
                     └──────────┬──────────┘
                                ▼
                  ┌───────────────────────────────┐
  Browser ──────► │  FastAPI  (cổng 8000)         │
  (Vite proxy     │  /v1/catalog.bin   binary     │
   /api/v1)       │  /v1/catalog/meta  chuỗi      │
                  │  /v1/stats         SQL agg    │
                  │  ETag · Cache-Control · gzip  │
                  └───────────────────────────────┘
                                ▼
              decodeCatalog() → typed arrays → InstancedMesh
```

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
| `docker-compose.yml` | Postgres (+ API qua `--profile api`) |

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

### 🔜 Giai đoạn 3 — Tính năng chỉ backend mới làm được ⬅️ *tiếp theo*

- [ ] **Time machine** — animate bầu trời "đầy dần" từ 1992 → nay.
      *Ghi chú:* `disc_year` đã có sẵn trong binary nên bản cơ bản làm được ngay ở client;
      còn `planet_history` mới là thứ cho phép xem **giá trị đo được tinh chỉnh ra sao**
      theo thời gian — cái đó NASA không cho truy vấn lại.
- [ ] **Tìm hành tinh tương đồng** — pgvector trên feature vector chuẩn hóa
      (radius, mass, insolation, teff). Cột `insolation` đã được tính và lưu sẵn ở Giai đoạn 2.
- [ ] Search server-side bằng `pg_trgm`; phân trang cho DataTable
- [ ] Permalink chia sẻ: filter + vị trí camera + hành tinh đang chọn → short URL
      (id đã là slug ổn định nên link sẽ không mục)
- [ ] OG image render phía server → link share hiện "hộ chiếu hành tinh"
- [ ] **Presence realtime qua WebSocket** — Redis pub/sub + presence TTL
- [ ] Auth + tài khoản: bookmark, bộ lọc đã lưu, "tour" tự tạo

### 🔜 Giai đoạn 4 — Hạ tầng

- [ ] **Tự động hóa ingest** — hiện vẫn phải chạy tay `python -m app.ingest`.
      Cần cron job / APScheduler / GitHub Actions schedule.
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

---

## 6. Chạy toàn bộ hệ thống

```bash
docker compose up -d db
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
**hổ phách** = đang chạy degraded.

---

## 7. Sổ nợ kỹ thuật (chưa xếp lịch)

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
