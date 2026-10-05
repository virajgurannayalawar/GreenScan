# ONNX model

The backend currently runs only the apple dataset classifier. Pesticide-residue
estimation and the vegetable gate are disabled; no placeholder residue scores
are returned.

| File | Purpose | Expected input | Expected output |
|---|---|---|---|
| `appleScanner_resnet18.onnx` | Apple dataset class | `float32[1, 3, 224, 224]`, NCHW, 8-bit RGB resized to 224×224 and ImageNet-normalised | `float32[1, 3]` logits ordered `[Fresh, High, Low]` |

Input/output **names** are read from the session at load time
(`session.inputNames[0]` / `session.outputNames[0]`), so you do not need to match
a particular naming convention — only the shapes and semantics above.

The classifier only runs on 8-bit RGB TIFF uploads. The backend uses the TIFF's
three RGB planes directly; it does not reuse a multispectral false-colour
preview. Its `Fresh`/`High`/`Low` output is the training dataset's class label,
not a pesticide-residue percentage. The model is required: a missing or
unloadable classifier causes scans to fail explicitly rather than return a
placeholder classification.

Check which path is live at any time:

```bash
curl localhost:4000/api/v1/health | jq .dependencies.models
# { "gate": "disabled", "residue": "disabled", "appleClassifier": "onnx" }
```
