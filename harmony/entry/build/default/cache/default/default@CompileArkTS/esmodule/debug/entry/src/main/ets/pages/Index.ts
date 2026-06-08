if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface Index_Params {
    controller?: webview.WebviewController;
    nativeBridge?: NativeBridge;
    proxyRegistered?: boolean;
}
import webview from "@ohos:web.webview";
import { NativeBridge } from "@bundle:com.dashboard.app/entry/ets/nativebridge/NativeBridge";
const DASHBOARD_URL = 'https://voadge.top:668/dashboard/index.html?app=1';
class Index extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.controller = new webview.WebviewController();
        this.nativeBridge = new NativeBridge();
        this.proxyRegistered = false;
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: Index_Params) {
        if (params.controller !== undefined) {
            this.controller = params.controller;
        }
        if (params.nativeBridge !== undefined) {
            this.nativeBridge = params.nativeBridge;
        }
        if (params.proxyRegistered !== undefined) {
            this.proxyRegistered = params.proxyRegistered;
        }
    }
    updateStateVars(params: Index_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
    }
    aboutToBeDeleted() {
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private controller: webview.WebviewController;
    private nativeBridge: NativeBridge;
    private proxyRegistered: boolean;
    aboutToAppear() {
    }
    onPageEnd() {
        if (!this.proxyRegistered) {
            this.proxyRegistered = true;
            this.controller.registerJavaScriptProxy(this.nativeBridge, 'appBridge', ['getLocation', 'biometricAuth', 'takePhoto'], [], 'ohos.permission.INTERNET');
            this.controller.refresh();
        }
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Web.create({ src: DASHBOARD_URL, controller: this.controller });
            Web.width('100%');
            Web.height('100%');
            Web.javaScriptAccess(true);
            Web.domStorageAccess(true);
            Web.geolocationAccess(true);
            Web.mixedMode(MixedMode.All);
            Web.onPageEnd(() => { this.onPageEnd(); });
        }, Web);
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
    static getEntryName(): string {
        return "Index";
    }
}
registerNamedRoute(() => new Index(undefined, {}), "", { bundleName: "com.dashboard.app", moduleName: "entry", pagePath: "pages/Index", pageFullPath: "entry/src/main/ets/pages/Index", integratedHsp: "false", moduleType: "followWithHap" });
