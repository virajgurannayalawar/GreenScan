# ONNX model drop-in

Place the two exported models here. Until they exist the backend runs in **stub
mode** (`ALLOW_STUB_INFERENCE=true`) and returns deterministic fake scores so the
app can be exercised end to end.

| File | Purpose | Expected input | Expected output |
|---|---|---|---|
| `vegetable_gate.onnx` | Is the subject a vegetable? | `float32[1, 3, 224, 224]`, NCHW, ImageNet-normalised false-colour preview | `float32[1, 2]` logits (`[not_vegetable, vegetable]`) **or** `float32[1, 1]` sigmoid logit |
| `pesticide_residue.onnx` | Residue percentage | `float32[1, C, 224, 224]`, NCHW, all bands scaled to 0..1 (`C` = band count in the TIFF) | `float32[1, 1]` percent (0..100) **or** `float32[1, 2]` `[percent, confidence]` |

Input/output **names** are read from the session at load time
(`session.inputNames[0]` / `session.outputNames[0]`), so you do not need to match
a particular naming convention — only the shapes and semantics above.

Once both files are present, set `ALLOW_STUB_INFERENCE=false` so a missing or
broken model fails loudly instead of silently degrading to stub output.

Check which path is live at any time:

```bash
curl localhost:4000/api/v1/health | jq .dependencies.models
# { "gate": "onnx", "residue": "stub" }
```
