# Native setup

`android/` and `ios/` are not committed — generate them once, then apply the
changes below. Every item here is required by one of the native libraries in
`package.json`; skip one and the corresponding feature fails at runtime rather
than at build time.

```bash
# From the repository root, generate the native projects into a temp app and
# copy them in, or run the usual init in place:
npx @react-native-community/cli@15.0.1 init PestiScan --version 0.76.6 --skip-install
# then move the generated android/ and ios/ folders into frontend/
```

---

## Android

### `android/build.gradle`

```gradle
buildscript {
    ext {
        // react-native-vision-camera 4.x requires API 26 as a minimum.
        minSdkVersion = 26
        compileSdkVersion = 35
        targetSdkVersion = 34
        ndkVersion = "26.1.10909125"
    }
}
```

### `android/app/src/main/AndroidManifest.xml`

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />

    <!-- Needed to read a .tif the user picks from shared storage. -->
    <uses-permission
        android:name="android.permission.READ_EXTERNAL_STORAGE"
        android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />

    <!-- The sensor probe must still run on devices without a camera. -->
    <uses-feature android:name="android.hardware.camera" android:required="false" />

    <application
        android:hardwareAccelerated="true"
        android:largeHeap="true"
        ...>
```

`android:largeHeap="true"` is not cosmetic: the decoder's output textures for a
2048×2048×6-band raster are ~100 MB of `Uint8Array`, which exceeds the default
per-process heap on many mid-range devices.

### `android/app/build.gradle`

```gradle
android {
    packagingOptions {
        // Both Skia and Vision Camera ship libc++_shared.so.
        pickFirst '**/libc++_shared.so'
    }
}
```

### Cleartext HTTP during development

The dev backend is plain HTTP, which Android blocks by default from API 28.
Add a debug-only network security config rather than disabling TLS globally:

`android/app/src/debug/res/xml/network_security_config.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">localhost</domain>
    </domain-config>
</network-security-config>
```

`android/app/src/debug/AndroidManifest.xml`

```xml
<application android:networkSecurityConfig="@xml/network_security_config" />
```

---

## iOS

### `ios/PestiScan/Info.plist`

```xml
<key>NSCameraUsageDescription</key>
<string>PestiScan checks whether this device has a multispectral sensor before a scan.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>PestiScan needs access to select multispectral .tif exports.</string>

<!-- Lets the document picker hand back a file in place rather than a copy. -->
<key>LSSupportsOpeningDocumentsInPlace</key>
<true/>
<key>UIFileSharingEnabled</key>
<true/>
```

### Cleartext HTTP during development

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
</dict>
```

### Pods

```bash
cd ios && pod install && cd ..
```

Minimum deployment target: **iOS 15.1** (Vision Camera 4 and Skia 1.x).

---

## Verification checklist

| Symptom | Cause |
|---|---|
| Pinch/pan do nothing on Android | `react-native-gesture-handler` not the first import in `index.js`, or `GestureHandlerRootView` missing |
| Reanimated error: "Native part not initialized" | `react-native-reanimated/plugin` missing or not last in `babel.config.js` |
| Canvas renders black | Shader failed to compile — check the Metro console for the SkSL error |
| Picker greys out `.tif` files | The MIME list in `services/documentPicker.ts` was narrowed; Android reports `application/octet-stream` for TIFF |
| `getAvailableCameraDevices()` returns `[]` | Camera permission not yet granted — the probe requests it first for this reason |
| OOM on a large file | `largeHeap` missing, or raise `config.maxTextureEdge` downward in `src/config/env.ts` |
