import geolocation from "@ohos:geolocation";
import userAuth from "@ohos:userIAM.userAuth";
import type { BusinessError } from "@ohos:base";
import cameraPicker from "@ohos:multimedia.cameraPicker";
import fileIo from "@ohos:file.fs";
import type { Context } from "@ohos:abilityAccessCtrl";
const BASE64_CHARS: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let uint8 = new Uint8Array(buffer);
    let result: string = '';
    for (let i = 0; i < uint8.byteLength; i += 3) {
        let b0: number = uint8[i];
        let b1: number = i + 1 < uint8.byteLength ? uint8[i + 1] : 0;
        let b2: number = i + 2 < uint8.byteLength ? uint8[i + 2] : 0;
        result += BASE64_CHARS[b0 >> 2];
        result += BASE64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
        if (i + 1 < uint8.byteLength) {
            result += BASE64_CHARS[((b1 & 0x0F) << 2) | (b2 >> 6)];
        }
        else {
            result += '=';
        }
        if (i + 2 < uint8.byteLength) {
            result += BASE64_CHARS[b2 & 0x3F];
        }
        else {
            result += '=';
        }
    }
    return result;
}
export class NativeBridge {
    static context: Context | null = null;
    getLocation(successCallback: (lat: number, lng: number, acc: number) => void, errorCallback: (err: string) => void) {
        try {
            geolocation.getCurrentLocation({ timeoutMs: 15000 }).then((pos: geolocation.Location) => {
                if (successCallback) {
                    successCallback(pos.latitude, pos.longitude, pos.accuracy);
                }
            }).catch((err: BusinessError) => {
                if (errorCallback) {
                    errorCallback(err.message || '获取位置失败');
                }
            });
        }
        catch (e) {
            if (errorCallback) {
                errorCallback('定位失败');
            }
        }
    }
    biometricAuth(): boolean {
        try {
            userAuth.getAvailableStatus(userAuth.UserAuthType.FINGERPRINT, userAuth.AuthTrustLevel.ATL2);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    takePhoto(callback: (dataUrl: string) => void) {
        try {
            let ctx = NativeBridge.context;
            if (!ctx) {
                callback('');
                return;
            }
            cameraPicker.pick(ctx, [cameraPicker.PickerMediaType.PHOTO], { cameraPosition: 0 }).then((result: cameraPicker.PickerResult) => {
                if (!result || !result.resultUri) {
                    callback('');
                    return;
                }
                let uri: string = result.resultUri;
                fileIo.open(uri, fileIo.OpenMode.READ_ONLY).then((file: fileIo.File) => {
                    fileIo.stat(uri).then((stat: fileIo.Stat) => {
                        let buf: ArrayBuffer = new ArrayBuffer(stat.size);
                        fileIo.read(file.fd, buf).then((readLen: number) => {
                            fileIo.close(file);
                            let base64: string = arrayBufferToBase64(buf);
                            callback('data:image/jpeg;base64,' + base64);
                        }).catch(() => {
                            fileIo.close(file);
                            callback('');
                        });
                    }).catch(() => {
                        fileIo.close(file);
                        callback('');
                    });
                }).catch(() => {
                    callback('');
                });
            }).catch(() => {
                callback('');
            });
        }
        catch (e) {
            callback('');
        }
    }
}
