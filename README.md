# LocFetch Engine v9 (XingSoft*2026)

**Bypass CORS and MIME-type restrictions in local environments (`file://`) or restricted servers.**

LocFetch is a drop-in fetch interceptor that automatically falls back to **JS Sidecar** files when standard network requests fail. It converts binary data (WASM, Video, Images) encoded in JS strings back into native Blobs, allowing seamless media playback and script execution without a local server.

## 🚀 Key Features

- **Standard Interceptor:** Completely transparent. Use `fetch()` as you normally would.
- **Smart Fallback:** If `data.wasm` is blocked or missing, it looks for `data.wasm.js`.
- **High-Density Encoding:** 
  - **Base64:** Traditional and reliable.
  - **Base85:** 25% more efficient than Base64.
  - **Base122:** Ultra-compact Unicode-based encoding for minimal overhead.
- **Integrity Check:** Rolling Hash (8-bit) checksum ensures your binary data isn't corrupted during encoding.
- **WASM Ready:** Specifically designed to support `WebAssembly.instantiateStreaming`.

## 📂 Repository Structure

- `en_loc_fetch.js`: The core engine (minified logic, protected scope).
- `en_sidecar_gen.html`: GUI tool to convert binary files to JS sidecars.
- `en_test_suite.html`: Full test suite for WASM, MP4, and PNG assets.

## 🛠 Quick Start

1. Include the engine in your HTML:
   ```html
   <script src="en_loc_fetch.js"></script>
   ```

2. Generate a sidecar for your asset (e.g., `my_app.wasm`) using `en_sidecar_gen.html`. You will get `my_app.wasm.js`.

3. Fetch your asset normally:
   ```javascript
   // LocFetch will automatically load the .js sidecar if the .wasm file fails
   const response = await fetch('my_app.wasm');
   const module = await WebAssembly.instantiateStreaming(response);
   ```

## ⚙️ Configuration

You can tune the engine via the global `g_fch` object:
```javascript
window.g_fch = {
  log: 1,      // Enable console logs
  alert: 0,    // Disable error alerts
  timeout: 5000, // Sidecar load timeout
  one_source: 1  // Force sidecar mode even on servers (offline-first)
};
```

## 📜 License
Created for the **XingSoft*2026** ecosystem. Free to use for bypassing local restrictions.
