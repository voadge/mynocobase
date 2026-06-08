import UIAbility from "@ohos:app.ability.UIAbility";
import type AbilityConstant from "@ohos:app.ability.AbilityConstant";
import type Want from "@ohos:app.ability.Want";
import abilityAccessCtrl from "@ohos:abilityAccessCtrl";
import type { Permissions } from "@ohos:abilityAccessCtrl";
import type window from "@ohos:window";
import type { BusinessError } from "@ohos:base";
import { NativeBridge } from "@bundle:com.dashboard.app/entry/ets/nativebridge/NativeBridge";
const PERMISSIONS: Permissions[] = [
    'ohos.permission.LOCATION',
    'ohos.permission.APPROXIMATELY_LOCATION',
    'ohos.permission.CAMERA',
    'ohos.permission.ACCESS_BIOMETRIC',
];
export default class EntryAbility extends UIAbility {
    onCreate(want: Want, launchParam: AbilityConstant.LaunchParam) {
    }
    onDestroy() {
    }
    onWindowStageCreate(windowStage: window.WindowStage) {
        NativeBridge.context = this.context;
        windowStage.loadContent('pages/Index', (err: BusinessError) => {
            if (err.code) {
                return;
            }
            try {
                let atManager = abilityAccessCtrl.createAtManager();
                atManager.requestPermissionsFromUser(this.context, PERMISSIONS).then((): void => {
                }).catch((): void => {
                });
            }
            catch (e) {
            }
        });
    }
    onWindowStageDestroy() {
    }
    onForeground() {
    }
    onBackground() {
    }
}
