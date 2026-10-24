"""Apple gate: apple vs not-apple, ResNet18.
Needs a Kaggle token in the KAGGLE_API_TOKEN environment variable and: pip install onnx onnxruntime
Output: appleGate2_resnet18.pth and appleGate2_resnet18.onnx (keep both out of GitHub)."""
import os, glob, random, shutil, subprocess
import numpy as np, torch, torch.nn as nn
from torchvision import datasets, models, transforms
from torch.utils.data import DataLoader

def download(slug, out):
    if not os.path.isdir(out):
        subprocess.run(["kaggle", "datasets", "download", "-d", slug, "-p", out, "--unzip"], check=True)

download("kritikseth/fruit-and-vegetable-image-recognition", "fruits")
download("warcoder/apple-hyperspectral-images-dataset", "data2")
download("ifigotin/imagenetmini-1000", "imnet")

random.seed(0)
froot = next(d for d, _, _ in os.walk("fruits") if os.path.isdir(os.path.join(d, "train", "apple")))
iroot = next(d for d, _, _ in os.walk("imnet") if os.path.isdir(os.path.join(d, "train", "n07742313")))
GS = "n07742313"  # ImageNet Granny Smith = apple, never used as not-apple

shutil.rmtree("gate2", ignore_errors=True)
for sp in ["train", "val"]:
    for c in ["apple", "not_apple"]:
        os.makedirs(f"gate2/{sp}/{c}")

def put(files, dst, tag):
    for i, f in enumerate(files):
        os.symlink(os.path.abspath(f), f"{dst}/{tag}_{i}{os.path.splitext(f)[1].lower()}")

# apples
put(glob.glob(f"{froot}/train/apple/*"), "gate2/train/apple", "k")
lab = glob.glob("data2/**/Apple_Samples/**/*.tif", recursive=True)
lab_test = [p for p in lab if "/Nativo/" in p and os.path.basename(p).startswith("A2_")]
lab_train = [p for p in lab if p not in lab_test]
random.shuffle(lab_train)
put(lab_train[:300], "gate2/train/apple", "lab")
put(glob.glob(f"{iroot}/train/{GS}/*"), "gate2/train/apple", "ing")
put(lab_test, "gate2/val/apple", "labtest")
put(glob.glob(f"{froot}/validation/apple/*") + glob.glob(f"{froot}/test/apple/*"), "gate2/val/apple", "kval")
put(glob.glob(f"{iroot}/val/{GS}/*"), "gate2/val/apple", "ingval")

# not apple: other fruits and vegetables, plus everyday ImageNet pictures
for c in os.listdir(f"{froot}/train"):
    if c == "apple":
        continue
    t = glob.glob(f"{froot}/train/{c}/*")
    random.shuffle(t)
    put(t[:25], "gate2/train/not_apple", c.replace(" ", "_"))
    put(glob.glob(f"{froot}/validation/{c}/*") + glob.glob(f"{froot}/test/{c}/*"),
        "gate2/val/not_apple", c.replace(" ", "_"))
for w in os.listdir(f"{iroot}/train"):
    if w == GS:
        continue
    t = glob.glob(f"{iroot}/train/{w}/*")
    random.shuffle(t)
    put(t[:4], "gate2/train/not_apple", "in" + w)
    v = glob.glob(f"{iroot}/val/{w}/*")
    random.shuffle(v)
    put(v[:2], "gate2/val/not_apple", "inval" + w)

dev = "cuda" if torch.cuda.is_available() else "cpu"
norm = transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
tr_tf = transforms.Compose([transforms.RandomResizedCrop(224, scale=(0.6, 1)), transforms.RandomHorizontalFlip(),
                            transforms.ColorJitter(0.3, 0.3, 0.3), transforms.ToTensor(), norm])
va_tf = transforms.Compose([transforms.Resize((224, 224)), transforms.ToTensor(), norm])
tr = datasets.ImageFolder("gate2/train", tr_tf)
va = datasets.ImageFolder("gate2/val", va_tf)

cnt = torch.bincount(torch.tensor(tr.targets)).float()
weights = (cnt.sum() / cnt).to(dev)  # balance apple vs not-apple
g = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
g.fc = nn.Linear(512, 2)
g = g.to(dev)
opt = torch.optim.Adam(g.parameters(), lr=1e-4)
loss_fn = nn.CrossEntropyLoss(weight=weights)
for ep in range(5):
    g.train()
    total = 0
    for x, y in DataLoader(tr, batch_size=64, shuffle=True, num_workers=2):
        x, y = x.to(dev), y.to(dev)
        opt.zero_grad()
        loss = loss_fn(g(x), y)
        loss.backward()
        opt.step()
        total += loss.item()
    print("epoch", ep + 1, "loss", round(total, 2))

# evaluate on images never used for training
g.eval()
P = []
with torch.no_grad():
    for x, y in DataLoader(va, batch_size=64, num_workers=2):
        P += torch.softmax(g(x.to(dev)), 1)[:, 0].cpu().tolist()
P = np.array(P)
names = [os.path.basename(s[0]) for s in va.samples]
y = np.array(va.targets)
grp = np.array(["lab apples" if n.startswith("labtest") else "real apples" if y[i] == 0
                else "everyday things" if n.startswith("inval") else "other fruit/veg" for i, n in enumerate(names)])
print("share accepted as apple at cut-off 0.3:",
      {k: round(float((P[grp == k] >= 0.3).mean()), 3) for k in ["lab apples", "real apples", "everyday things", "other fruit/veg"]})

torch.save(g.state_dict(), "appleGate2_resnet18.pth")
import onnxruntime as ort
net = g.cpu().eval()
dummy = torch.randn(1, 3, 224, 224)
torch.onnx.export(net, dummy, "appleGate2_resnet18.onnx", input_names=["input"], output_names=["logits"],
                  opset_version=17, dynamo=False)
a = ort.InferenceSession("appleGate2_resnet18.onnx").run(None, {"input": dummy.numpy()})[0]
print("onnx check, max difference:", float(np.abs(a - net(dummy).detach().numpy()).max()))
