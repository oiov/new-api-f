import requests
import time

url = "https://landing.fishxcode.com/"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

print(f"Starting to refresh {url} 10 times...")

for i in range(1, 10001):
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            print(f"Request {i}: Success")
        else:
            print(f"Request {i}: Failed with status code {response.status_code}")
    except Exception as e:
        print(f"Request {i}: Error - {e}")
    time.sleep(1)  # Wait a bit between requests

print("Finished refreshing.")
