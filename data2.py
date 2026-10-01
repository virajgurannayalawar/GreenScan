import subprocess
import sys
import os

destination = os.path.join(os.path.dirname(__file__), "data2")

if os.path.exists(destination) and os.listdir(destination):
    print("Dataset 2 already exists. No download needed.")
else:
    os.makedirs(destination, exist_ok=True)

    subprocess.run([
        sys.executable, "-m", "kaggle",
        "datasets", "download",
        "-d", "warcoder/apple-hyperspectral-images-dataset",
        "-p", destination,
        "--unzip"
    ], check=True)

    print("Dataset 2 imported successfully!")