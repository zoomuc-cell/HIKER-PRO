package com.hikerpro;

import android.provider.Settings;
import android.util.Log;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class AdminIdModule extends ReactContextBaseJavaModule {
  AdminIdModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "AdminIdModule";
  }

  @ReactMethod
  public void getAndroidId(Promise promise) {
    try {
      String id = Settings.Secure.getString(
          getReactApplicationContext().getContentResolver(),
          Settings.Secure.ANDROID_ID);
      Log.i("AdminIdModule", "android_id=" + id);
      promise.resolve(id);
    } catch (Exception e) {
      promise.reject("ERR_ADMIN_ID", e);
    }
  }
}