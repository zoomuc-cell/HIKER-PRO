package com.hikerpro

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

// AdminIdPackage 와 같은 방식의 수동 등록 패키지 (MainApplication 에서 add)
class HikerSharePackage : ReactPackage {
  @Deprecated("Legacy ReactPackage registration (same as AdminIdPackage)")
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
      listOf(HikerShareModule(reactContext))

  override fun createViewManagers(
      reactContext: ReactApplicationContext
  ): List<ViewManager<in Nothing, in Nothing>> = emptyList()
}
