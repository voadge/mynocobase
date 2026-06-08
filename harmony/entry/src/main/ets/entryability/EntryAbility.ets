import { UIAbility, AbilityConstant, Want, abilityAccessCtrl, Permissions, Context } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { BusinessError } from '@kit.BasicServicesKit';
import { NativeBridge } from '../nativebridge/NativeBridge';

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
      } catch (e) {
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
