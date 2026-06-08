# Capacitor 移动端封装方案

## 目标
将现有系统移动端用原生壳封装，获得 GPS、相机、面容/指纹能力。桌面端 + 手机浏览器不变，app 为第三端。

## 架构
三端共用服务器同一份代码，app 启动时带 `?app=1` 参数区分。
```
桌面/手机浏览器 → dashboard/index.html（无 ?app=1，原逻辑）
App（Android）  → Capacitor server.url + ?app=1
App（HarmonyOS）→ ArkWeb Web({src}) + ?app=1
```

## 三端检测模式
```js
if (typeof Capacitor !== 'undefined') {
  // Android 原生
} else if (window.appBridge) {
  // HarmonyOS 原生
} else {
  // 浏览器回退（原代码不动）
}
```

## 服务器端改动（3 文件）
| 文件 | 改动点 | 行数 |
|------|--------|------|
| `dashboard/index.html` | ① `?app=1` 隐藏工作版块 ② `_getLocationOnce` 三端分支 ③ `verifyFingerprint` 前置原生 + 1周过期 ④ 天气GPS三端分支 | ~30 |
| `dashboard/人员动态.html` | `collectAndReport` + `locateMe` 三端分支 | ~15 |
| `assets/core.js` | `fetchWeatherData` GPS 三端分支 | ~8 |

## Android 壳
1. `npm install @capacitor/biometric-auth`
2. `capacitor.config.json` 加 `"url": "https://voadge.top:668/dashboard/index.html?app=1"`
3. `AndroidManifest.xml` 加 CAMERA / ACCESS_FINE_LOCATION / ACCESS_BACKGROUND_LOCATION / USE_BIOMETRIC
4. `npx cap sync && npx cap copy && cd android && .\gradlew assembleDebug`

## HarmonyOS NEXT 壳（阶段二）
ArkWeb 加载同一 URL + NativeBridge.ets（定位/生物识别桥接）

## 指纹 1 周有效期
```js
// 保存
localStorage.setItem('_attendDeviceId', _deviceFp);
localStorage.setItem('_attendDeviceId_ts', Date.now());
// 检查
if (stored === _deviceFp && Date.now() - ts < 604800000) { /* 快速验证 */ }
```
