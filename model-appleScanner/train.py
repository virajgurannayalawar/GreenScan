import os, subprocess
import torch, torch.nn as nn
from torch.utils.data import DataLoader, Subset
from torchvision import datasets, models, transforms

DATA = "data2"
PATH = os.path.join(DATA, "Apple-Hyperspectral images", "Apple_Samples", "Nativo")
if not os.path.exists(DATA):
    subprocess.run(["kaggle", "datasets", "download", "-d",
                    "warcoder/apple-hyperspectral-images-dataset",
                    "-p", DATA, "--unzip"], check=True)

tf = transforms.Compose([transforms.Resize((224, 224)), transforms.ToTensor(),
                         transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
data = datasets.ImageFolder(PATH, transform=tf)
device = "cuda" if torch.cuda.is_available() else "cpu"

def apple_id(p): return os.path.basename(p).split("_")[0]
def subset(ids): return Subset(data, [i for i, (p, _) in enumerate(data.samples) if apple_id(p) in ids])

def train(ds, epochs=10):
    torch.manual_seed(0)
    m = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
    m.fc = nn.Linear(m.fc.in_features, len(data.classes))
    m = m.to(device)
    opt = torch.optim.Adam(m.parameters(), lr=1e-4)
    loss_fn = nn.CrossEntropyLoss()
    for _ in range(epochs):
        m.train()
        for x, y in DataLoader(ds, batch_size=8, shuffle=True):
            x, y = x.to(device), y.to(device)
            opt.zero_grad(); loss_fn(m(x), y).backward(); opt.step()
    return m

def accuracy(m, ds):
    m.eval(); c = 0
    with torch.no_grad():
        for x, y in DataLoader(ds, batch_size=8):
            c += (m(x.to(device)).argmax(1).cpu() == y).sum().item()
    return c / len(ds)

print("train A1, test A2:", accuracy(train(subset({"A1"})), subset({"A2"})))
print("train A2, test A1:", accuracy(train(subset({"A2"})), subset({"A1"})))
torch.save(train(subset({"A1", "A2"})).state_dict(), "model-appleScanner/appleScanner_resnet18.pth")
