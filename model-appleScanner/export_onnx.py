import argparse
import json
from collections.abc import Mapping
from pathlib import Path

import onnx
import onnxruntime as ort
import torch
from torch import nn
from torchvision import models


CLASSES = ("Fresh", "High", "Low")
DEFAULT_CHECKPOINT = Path(__file__).with_name("appleScanner_resnet18.pth")
DEFAULT_OUTPUT = Path(__file__).with_name("appleScanner_resnet18.onnx")


def load_model(checkpoint_path: Path) -> nn.Module:
    state_dict = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    if not isinstance(state_dict, Mapping):
        raise TypeError("Checkpoint must contain a model state dictionary.")

    model = models.resnet18(weights=None)
    model.fc = nn.Linear(model.fc.in_features, len(CLASSES))
    model.load_state_dict(state_dict, strict=True)
    model.eval()
    return model


def main() -> None:
    parser = argparse.ArgumentParser(description="Export the apple classifier to ONNX.")
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if not args.checkpoint.is_file():
        raise FileNotFoundError(f"Checkpoint not found: {args.checkpoint}")

    model = load_model(args.checkpoint)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    example_input = torch.zeros(1, 3, 224, 224, dtype=torch.float32)

    torch.onnx.export(
        model,
        (example_input,),
        str(args.output),
        input_names=["image"],
        output_names=["logits"],
        dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )

    onnx_model = onnx.load(args.output)
    onnx.checker.check_model(onnx_model)
    metadata = {
        "task": "apple quality classification",
        "classes": list(CLASSES),
        "input": "float32 NCHW RGB, 224x224, ImageNet-normalized",
        "output": "float32 logits ordered as classes",
    }
    del onnx_model.metadata_props[:]
    for key, value in metadata.items():
        entry = onnx_model.metadata_props.add()
        entry.key = key
        entry.value = json.dumps(value) if isinstance(value, list) else value
    onnx.save(onnx_model, args.output)

    session = ort.InferenceSession(str(args.output), providers=["CPUExecutionProvider"])
    test_input = torch.randn(1, 3, 224, 224, generator=torch.Generator().manual_seed(7))
    with torch.inference_mode():
        torch_output = model(test_input).numpy()
    onnx_output = session.run(["logits"], {"image": test_input.numpy()})[0]
    torch.testing.assert_close(
        torch.from_numpy(onnx_output),
        torch.from_numpy(torch_output),
        rtol=1e-4,
        atol=1e-5,
    )

    print(f"Exported and validated: {args.output}")
    print(f"Classes (logit order): {', '.join(CLASSES)}")
    print(f"Input: {session.get_inputs()[0].shape} float32 NCHW, ImageNet-normalized")
    print(f"Output: {session.get_outputs()[0].shape} float32 logits")


if __name__ == "__main__":
    main()
