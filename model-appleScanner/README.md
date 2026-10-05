Trained model (.pth): https://drive.google.com/file/d/15S8c9LP3_KDFZhvbYrfOY0dfcqMlEwsp/view?usp=drivesdk

## ONNX export

`appleScanner_resnet18.onnx` is the ONNX export of
`appleScanner_resnet18.pth`. It is a three-class apple-quality classifier;
output logits are ordered `Fresh`, `High`, `Low`. It does not estimate
pesticide-residue percentages.

The model input is `float32[N, 3, 224, 224]` RGB, resized to 224×224 and
normalized with ImageNet mean `[0.485, 0.456, 0.406]` and standard deviation
`[0.229, 0.224, 0.225]`, matching `train.py`.

To reproduce the export in an environment with PyTorch, torchvision, ONNX, and
ONNX Runtime installed:

```bash
python export_onnx.py
```

The exporter loads the state dict in weights-only mode, validates the ONNX
graph, and compares ONNX Runtime logits against PyTorch before reporting
success.
