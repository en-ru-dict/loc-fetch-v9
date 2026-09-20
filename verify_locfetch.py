import asyncio
import os
import subprocess
import time
from playwright.async_api import async_playwright

async def run_test(use_locfetch=True):
    print(f"\n--- Testing with {'LocFetch' if use_locfetch else 'Direct Loading'} ---")
    
    # Start local server
    server_process = subprocess.Popen(
        ["python3", "-m", "http.server", "8888"],
        cwd="/home/boxpiton/test-20sen",
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(2) # Wait for server to start

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        # Capture console logs
        logs = []
        page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: logs.append(f"[ERROR] {err}"))

        # Navigate to test suite
        url = "http://localhost:8888/en_test_suite.html"
        await page.goto(url)
        
        # Wait for media init
        await asyncio.sleep(2)

        # 1. Test WASM
        print("Triggering WASM load...")
        await page.click("button:has-text('1. Load & Initialize WASM')")
        await asyncio.sleep(2)
        
        # 2. Test Video Capture
        print("Triggering Video Capture...")
        # Button 1: Sidecar, Button 2: Direct
        await page.click("button:has-text('Capture from Sidecar')")
        await page.click("button:has-text('Capture from Direct')")
        
        # 3. Test Image Read
        print("Triggering Image Read...")
        await page.click("button:has-text('Read from Sidecar')")
        await page.click("button:has-text('Read from Direct')")

        await asyncio.sleep(1)
        
        print("\nCaptured Logs:")
        for log in logs:
            print(line := log)
            
        # Check for specific success markers
        if any("WASM module initialized!" in l for l in logs):
            print("✅ WASM SUCCESS")
        if any("Frame captured from id_v1" in l for l in logs):
            print("✅ Video Sidecar SUCCESS")
        if any("SecurityError" in l or "tainted" in l for l in logs):
            print("⚠️ Direct Access BLOCKED (As expected)")

        await browser.close()

    server_process.terminate()

if __name__ == "__main__":
    # We test with the suite that already has LocFetch included
    asyncio.run(run_test(use_locfetch=True))
