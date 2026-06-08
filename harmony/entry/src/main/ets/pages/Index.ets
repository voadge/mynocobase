import { webview } from '@kit.ArkWeb';
import { NativeBridge } from '../nativebridge/NativeBridge';

const DASHBOARD_URL = 'https://voadge.top:668/dashboard/index.html?app=1';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private nativeBridge: NativeBridge = new NativeBridge();

  private proxyRegistered: boolean = false;

  aboutToAppear() {
  }

  onPageEnd() {
    if (!this.proxyRegistered) {
      this.proxyRegistered = true;
      this.controller.registerJavaScriptProxy(
        this.nativeBridge,
        'appBridge',
        ['getLocation', 'biometricAuth', 'takePhoto'],
        [],
        'ohos.permission.INTERNET'
      );
      this.controller.refresh();
    }
  }

  build() {
    Column() {
      Web({ src: DASHBOARD_URL, controller: this.controller })
        .width('100%')
        .height('100%')
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .geolocationAccess(true)
        .mixedMode(MixedMode.All)
        .onPageEnd(() => { this.onPageEnd(); })
    }
    .width('100%')
    .height('100%')
  }
}
