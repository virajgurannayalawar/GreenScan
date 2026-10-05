import urllib.request
import zipfile
import os

destination = os.path.join(os.path.dirname(__file__), "data3")
os.makedirs(destination, exist_ok=True)

# Check whether data3 already contains files
if os.listdir(destination):
    print("Dataset 3 already exists. No download needed.")
else:
    url = "https://zenodo.org/records/18877376/files/data.zip?download=1"
    zip_path = os.path.join(destination, "data.zip")

    print("Downloading Dataset 3...")

    urllib.request.urlretrieve(url, zip_path)

    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        zip_ref.extractall(destination)

    os.remove(zip_path)

    print("Dataset 3 imported successfully!")