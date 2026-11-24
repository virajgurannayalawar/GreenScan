# ONNX model

The backend runs an apple-vs-non-apple gate before the apple dataset
classifier. Pesticide-residue estimation is disabled; no placeholder residue
scores are returned.

| File | Purpose | Expected input | Expected output |
|---|---|---|---|
| `appleGate2_resnet18.onnx` | Apple vs. non-apple gate | `float32[1, 3, 224, 224]`, NCHW, 8-bit RGB resized to 224×224 and ImageNet-normalised | `float32[1, 2]` logits ordered `[apple, not_apple]` |
| `appleScanner_resnet18.onnx` | Apple dataset class | `float32[1, 3, 224, 224]`, NCHW, 8-bit RGB resized to 224×224 and ImageNet-normalised | `float32[1, 3]` logits ordered `[Fresh, High, Low]` |

Input/output **names** are read from the session at load time
(`session.inputNames[0]` / `session.outputNames[0]`), so you do not need to match
a particular naming convention — only the shapes and semantics above.

Model binaries are excluded from Git. Render downloads them from the public
`VirajGuranna/applePestiScanner` Hugging Face repository during its build; the
repository must remain public and retain the filenames above. The backend uses
the configured model paths and reports missing models rather than returning
placeholder classifications.

The apple gate runs before upload and quality classification. It accepts an
image when its apple probability is at least `0.3`, matching the threshold
reported by `model-appleScanner/train_gate.py`; otherwise the scan endpoint
returns a `not_apple` error with a user-facing message. The gate uses
`ONNX_APPLE_GATE_MODEL_PATH`, which defaults to
`models/appleGate2_resnet18.onnx` relative to the backend directory.

The classifier only runs on 8-bit RGB TIFF uploads. The backend uses the TIFF's
three RGB planes directly; it does not reuse a multispectral false-colour
preview. Its `Fresh`/`High`/`Low` output is the training dataset's class label,
not a pesticide-residue percentage. The model is required: a missing or
unloadable classifier causes scans to fail explicitly rather than return a
placeholder classification.

Check which path is live at any time:

```bash
curl localhost:4000/api/v1/health | jq .dependencies.models
# { "appleGate": "onnx", "residue": "disabled", "appleClassifier": "onnx" }
```
