package com.voadge.pd.attend;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.core.app.ActivityCompat;

import java.lang.ref.WeakReference;

public class AppBridge {

    private final WeakReference<Activity> activityRef;
    private final WeakReference<WebView> webViewRef;
    private final Handler mainHandler;
    private final ActivityResultLauncher<Intent> takePhotoLauncher;

    public static volatile String pendingPhotoCallbackId;

    public AppBridge(Activity activity, WebView webView, ActivityResultLauncher<Intent> takePhotoLauncher) {
        this.activityRef = new WeakReference<>(activity);
        this.webViewRef = new WeakReference<>(webView);
        this.mainHandler = new Handler(Looper.getMainLooper());
        this.takePhotoLauncher = takePhotoLauncher;
    }

    @JavascriptInterface
    public String _biometricAuth() {
        Activity activity = activityRef.get();
        if (activity == null) return "false";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            android.hardware.biometrics.BiometricManager manager =
                    activity.getSystemService(android.hardware.biometrics.BiometricManager.class);
            if (manager != null) {
                int result;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    result = manager.canAuthenticate(
                            android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_WEAK);
                } else {
                    result = manager.canAuthenticate();
                }
                return String.valueOf(result == android.hardware.biometrics.BiometricManager.BIOMETRIC_SUCCESS);
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return String.valueOf(activity.getPackageManager().hasSystemFeature(PackageManager.FEATURE_FINGERPRINT));
        }
        return "false";
    }

    @JavascriptInterface
    public void _getLocation(final String callbackId) {
        Activity activity = activityRef.get();
        if (activity == null) return;

        if (ActivityCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            callbackError(callbackId, "位置权限未授予");
            return;
        }

        LocationManager locationManager = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) {
            callbackError(callbackId, "定位服务不可用");
            return;
        }

        boolean gpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER);
        boolean networkEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);

        if (!gpsEnabled && !networkEnabled) {
            callbackError(callbackId, "GPS已关闭");
            return;
        }

        try {
            LocationListener listener = new LocationListener() {
                @Override
                public void onLocationChanged(Location location) {
                    if (location != null) {
                        callbackLocation(callbackId, location.getLatitude(), location.getLongitude(), location.getAccuracy());
                    } else {
                        callbackError(callbackId, "获取位置失败");
                    }
                }

                @Override
                public void onStatusChanged(String provider, int status, Bundle extras) {
                }

                @Override
                public void onProviderEnabled(String provider) {
                }

                @Override
                public void onProviderDisabled(String provider) {
                    callbackError(callbackId, provider + "已关闭");
                }
            };

            if (gpsEnabled) {
                locationManager.requestSingleUpdate(LocationManager.GPS_PROVIDER, listener, Looper.getMainLooper());
            } else {
                locationManager.requestSingleUpdate(LocationManager.NETWORK_PROVIDER, listener, Looper.getMainLooper());
            }

            mainHandler.postDelayed(() -> callbackError(callbackId, "定位超时"), 15000);
        } catch (SecurityException e) {
            callbackError(callbackId, "定位权限被拒绝");
        }
    }

    @JavascriptInterface
    public void _takePhoto(final String callbackId) {
        Activity activity = activityRef.get();
        if (activity == null) return;

        if (ActivityCompat.checkSelfPermission(activity, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            callbackError(callbackId, "相机权限未授予");
            return;
        }

        pendingPhotoCallbackId = callbackId;

        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (intent.resolveActivity(activity.getPackageManager()) != null) {
            mainHandler.post(() -> takePhotoLauncher.launch(intent));
        } else {
            pendingPhotoCallbackId = null;
            callbackError(callbackId, "相机不可用");
        }
    }

    public static void handlePhotoResult(Activity activity, WebView webView, int resultCode, Intent data) {
        final String callbackId = pendingPhotoCallbackId;
        pendingPhotoCallbackId = null;

        if (callbackId == null) return;

        if (resultCode == Activity.RESULT_OK && data != null && data.getExtras() != null) {
            android.graphics.Bitmap bitmap = (android.graphics.Bitmap) data.getExtras().get("data");
            if (bitmap != null) {
                java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, baos);
                byte[] bytes = baos.toByteArray();
                String base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP);
                final String dataUrl = "data:image/jpeg;base64," + base64;
                evalJS(webView, "window._bridgeCB && window._bridgeCB['" + callbackId + "'] && window._bridgeCB['" + callbackId + "']('" + dataUrl + "')");
                return;
            }
        }
        evalJS(webView, "window._bridgeCB && window._bridgeCB['" + callbackId + "'] && window._bridgeCB['" + callbackId + "']('')");
    }

    private void callbackLocation(String callbackId, double lat, double lng, float acc) {
        final String js = "window._bridgeCB && window._bridgeCB['" + callbackId + "'] && window._bridgeCB['" + callbackId + "'].success(" + lat + "," + lng + "," + acc + ")";
        WebView wv = webViewRef.get();
        if (wv != null) {
            wv.post(() -> wv.evaluateJavascript(js, null));
        }
    }

    private void callbackError(String callbackId, String message) {
        final String escapedMsg = message.replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r");
        final String js = "window._bridgeCB && window._bridgeCB['" + callbackId + "'] && window._bridgeCB['" + callbackId + "'].error && window._bridgeCB['" + callbackId + "'].error('" + escapedMsg + "')";
        WebView wv = webViewRef.get();
        if (wv != null) {
            wv.post(() -> wv.evaluateJavascript(js, null));
        }
    }

    private static void evalJS(WebView webView, String js) {
        if (webView != null) {
            webView.post(() -> webView.evaluateJavascript(js, null));
        }
    }
}
