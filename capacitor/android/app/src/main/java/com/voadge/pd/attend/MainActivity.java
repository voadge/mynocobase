package com.voadge.pd.attend;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final int REQUEST_PERMISSIONS = 1002;

    private static final String[] REQUIRED_PERMISSIONS = {
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.CAMERA,
            Manifest.permission.USE_BIOMETRIC,
    };

    private AppBridge appBridge;
    private ActivityResultLauncher<Intent> takePhotoLauncher;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        takePhotoLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> AppBridge.handlePhotoResult(this, bridge.getWebView(), result.getResultCode(), result.getData())
        );

        WebView webView = bridge.getWebView();
        appBridge = new AppBridge(this, webView, takePhotoLauncher);

        webView.addJavascriptInterface(appBridge, "_AndroidBridge");

        injectBridgeAdapter(webView);

        requestPermissionsIfNeeded();
    }

    private void injectBridgeAdapter(WebView webView) {
        String adapterJS = getBridgeAdapterScript();
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(webView, adapterJS, Collections.singleton("*"));
        } else {
            webView.evaluateJavascript(adapterJS, null);
        }
    }

    private void requestPermissionsIfNeeded() {
        List<String> needed = new ArrayList<>();
        for (String perm : REQUIRED_PERMISSIONS) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needed.add(perm);
            }
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), REQUEST_PERMISSIONS);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    private String getBridgeAdapterScript() {
        return "(function(){" +
                "var n=window._AndroidBridge;" +
                "if(!n||window.__bridgePatched)return;" +
                "window.__bridgePatched=true;" +
                "window._bridgeCB={};" +
                "window.appBridge={" +
                "getLocation:function(s,e){var id='_loc_'+Date.now();window._bridgeCB[id]={success:s,error:e};n._getLocation(id);}," +
                "biometricAuth:function(){return n._biometricAuth()==='true';}," +
                "takePhoto:function(cb){var id='_photo_'+Date.now();window._bridgeCB[id]=cb;n._takePhoto(id);}" +
                "};" +
                "})();";
    }
}
