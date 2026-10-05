# PestiScan

Multispectral pesticide-residue screening. A React Native app renders a
multispectral `.tif` as a false-colour composite entirely on the GPU, while a
Node/Express service archives the raw file to Cloudinary and scores it with two
ONNX models.

```
PestiScan/
├── frontend/     React Native 0.76 · Zustand · Skia · Vision Camera · Blob Util
└── backend/      Express · MongoDB · onnxruntime-node · Cloudinary · Multer
```

Nothing is installed and no credentials are set — `package.json` declares the
dependency set, `.env.example` declares the configuration surface.

---

## The flow

```
  ┌──────────────────────┐
  │  Start Scan (green)  │
  └──────────┬───────────┘
             │
   Camera.getAvailableCameraDevices()
             │
     ┌───────┴────────┐
     │                │
 multispectral    anything else
     │                │
 live capture     ╔═══════════════════╗
  (branch         ║ .tif upload widget ║
   reserved)      ╚═════════╤═════════╝
                            │  file picked
            ┌───────────────┴────────────────┐
            │                                │
      ── Work-I ──                     ── Work-II ──
   on-device GPU render             backend analysis
            │                                │
  1. native streaming read          1. Cloudinary archive (raw)
  2. SkSL band remap on GPU         2. decode every band
  3. Skia canvas + gestures         3. vegetable gate → residue model
            │                                │
            └──────────┬─────────────────────┘
                       │
              Scan · Profile · History
```

Work-I and Work-II are launched together with `Promise.allSettled`, so a decode
failure still yields a server score and a dead network still shows the picture.

---

## Work-I — on-device render

Three steps, matching the three problems they solve.

**1 · Native streaming load** — `src/services/nativeFile.ts`

`fs.readFile(path, 'base64')` would turn a 60 MB TIFF into an 80 MB JavaScript
string crossing the bridge in one blocking hop. Instead `fs.slice` performs the
byte-range copy in native code and only ~1 MB is ever pulled into JS at a time.
Peak JS heap is flat regardless of file size, and the UI thread never blocks.

**2 · GPU band remapping** — `src/shaders/falseColor.ts`

A JS loop over a 2048×2048×5 raster is ~21 million single-threaded reads. The
same work as an SkSL fragment program is one GPU dispatch. Band assignment is
driven by *uniform* selector vectors, so switching NIR → red to Red Edge → red
is a uniform write, not a shader recompile.

Default mapping (5-band sensor: `0 Blue · 1 Green · 2 Red · 3 NIR · 4 Red Edge`):

| Screen channel | Source band |
|---|---|
| Red | 3 — NIR |
| Green | 4 — Red Edge |
| Blue | 1 — Green |

Configurable per sensor from the Profile tab; an NDVI colour-ramp mode is also
included.

**3 · Skia canvas** — `src/components/MultispectralViewer.tsx`

No `<Image>` anywhere. The pixels are shader output sampling raw band textures.
Pan and pinch run on the Reanimated UI thread, so gestures stay at refresh rate
even while the JS thread is busy with the upload.

Two implementation notes worth knowing before you change anything:

- **Two textures, not one.** Bands go into the R/G/B channels of *opaque*
  textures with alpha pinned to 255. Using alpha as a fourth data channel looks
  efficient but Skia premultiplies on sample, which would scale the other three
  channels by the band stored in alpha and silently destroy the radiometry. Two
  opaque RGB textures cover six bands with no such hazard.
- **Nearest-neighbour sampling.** Bilinear filtering invents reflectance values
  the sensor never recorded — wrong for a measurement you are about to read a
  pesticide number off.

### Decoder scope

`src/services/tiffDecoder.ts` handles **uncompressed baseline TIFF**, 8/16-bit
integer or 32-bit float, chunky or planar, up to 6 bands — which is what
multispectral sensors write natively. LZW/Deflate/JPEG-in-TIFF and BigTIFF are
rejected with a specific error and handled server-side instead (the backend has
`geotiff` and no mobile memory ceiling). The app surfaces this as "on-device
preview unavailable" while still showing the server's score, rather than
failing the scan.

---

## Work-II — backend analysis

`POST /api/v1/scans` (multipart: `file`, `deviceId`, `clientScanId`, `metadata`)

The upload streams off disk via `ReactNativeBlobUtil.wrap(path)` — no base64,
no FormData in the JS heap.

Server-side the Cloudinary archive and the inference pipeline run concurrently.
Cheap checks gate expensive ones:

1. **Decode** all bands (`geotiff`, planar output).
2. **Quality gate** — variance of the Laplacian plus a blown-out-pixel ratio.
   Below threshold → `rejected / unclear_image`. A blurry photo of a brick never
   reaches the regressor.
3. **Vegetable gate** — `vegetable_gate.onnx` on the false-colour preview.
   Below `VEGETABLE_CONFIDENCE_THRESHOLD` → `rejected / not_vegetable` with the
   message *"This does not look like a vegetable…"*.
4. **Residue regressor** — `pesticide_residue.onnx` over all bands → percentage,
   bucketed into `none · low · moderate · high · severe`.

Cloudinary uses `resource_type: 'raw'` deliberately: its image pipeline does not
understand multi-band TIFF and would flatten the extra bands away.

### Stub mode

With no `.onnx` files present and `ALLOW_STUB_INFERENCE=true`, both models fall
back to **deterministic hash-derived output** so the whole flow is testable
before weights exist. It is the same answer for the same file every time, and the
UI labels it clearly as stub output — it is not a measurement. Set
`ALLOW_STUB_INFERENCE=false` once real models are in place so a missing model
fails loudly. Check which path is live:

```bash
curl localhost:4000/api/v1/health | jq .dependencies.models
```

Expected model shapes are documented in `backend/models/README.md`.

### API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | Mongo / Cloudinary / model status |
| `POST` | `/api/v1/scans` | Upload + analyse (idempotent on `clientScanId`) |
| `GET` | `/api/v1/scans/:id` | Single scan |
| `DELETE` | `/api/v1/scans/:id` | Delete scan and its Cloudinary asset |
| `GET` | `/api/v1/history` | Cursor-paginated scan list |
| `GET` | `/api/v1/history/summary` | Totals, average/max residue, level breakdown |
| `GET` | `/api/v1/profile` | Profile (upserts on first call) |
| `PATCH` | `/api/v1/profile` | Update profile / band mapping |

There is no login screen. Requests carry an `x-device-id` header generated and
persisted on first launch (`src/services/deviceIdentity.ts`); the backend keys
profiles and history on it. Swap that module for your auth subject when real
accounts land.

---

## Tabs

| Position | Tab | Contents |
|---|---|---|
| 1 (default) | **Scan** | Green Start Scan button → sensor probe → upload widget → viewer + render controls + verdict |
| 2 | **Profile** | Operator fields, per-sensor band mapping, activity stats, backend diagnostics |
| 3 | **History** | Cursor-paginated scans with summary stats; long-press a row to delete |

---

## Running it

### Backend

```bash
cd backend
npm install
cp .env.example .env     # fill in MONGODB_URI and CLOUDINARY_*
npm run dev              # http://localhost:4000
```

The API boots without Cloudinary credentials and without model files — it logs
a warning and records uploads as `skipped`, so the rest of the flow stays
testable.

### Frontend

```bash
cd frontend
npm install
```

Then generate and patch the native projects — **see `frontend/NATIVE_SETUP.md`**,
which lists the required `minSdkVersion`, manifest permissions, `largeHeap`,
Info.plist keys, and cleartext-HTTP config. The app will not work without them.

```bash
npm run pods             # iOS only
npm run android          # or: npm run ios
```

Point the app at your machine in `src/config/env.ts`:

| Target | `apiBaseUrl` |
|---|---|
| Android emulator | `http://10.0.2.2:4000` |
| iOS simulator | `http://localhost:4000` |
| Physical device | `http://<your-lan-ip>:4000` |

---

## What is not implemented

Stated plainly so nothing here is a surprise during testing.

- **Live multispectral capture.** Vision Camera's `PhysicalCameraDeviceType`
  union is exactly `ultra-wide-angle-camera | wide-angle-camera |
  telephoto-camera` — all Bayer RGB behind an IR-cut filter. No shipping handset
  exposes a multispectral device, so the probe in
  `src/services/cameraCapability.ts` is written as an extension point: add a
  marker to `MULTISPECTRAL_MARKERS` and the branch lights up. Today it always
  routes to the `.tif` widget, which is the spec's intended path.
- **Real model weights.** See *Stub mode* above.
- **Authentication.** Device-id scoped, as described above.
- **Compressed / BigTIFF on-device preview.** Server-side only, by design.
- **Tests.** Jest is configured but no suites are written.
