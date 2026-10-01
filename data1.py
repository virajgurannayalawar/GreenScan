import subprocess
import sys
import os

destination = os.path.join(os.path.dirname(__file__), "data1")

if os.path.exists(destination) and os.listdir(destination):
    print("Dataset 1 already exists. No download needed.")
else:
    os.makedirs(destination, exist_ok=True)

    subprocess.run([
        sys.executable, "-m", "kaggle",
        "datasets", "download",
        "-d", "vegetabledataset/mancozeb-and-other-chemical-residues",
        "-p", destination,
        "--unzip"
    ], check=True)

    print("Dataset 1 imported successfully!")