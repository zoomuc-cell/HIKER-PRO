package com.hikerpro

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** JS 에서 활동 기록 시작/종료 때 TrackingForegroundService 를 켜고 끈다. */
class HikerTrackingModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "HikerTracking"

  @ReactMethod
  fun start(title: String, text: String, promise: Promise) {
    try {
      val intent = Intent(reactContext, TrackingForegroundService::class.java)
      intent.putExtra(TrackingForegroundService.EXTRA_TITLE, title)
      intent.putExtra(TrackingForegroundService.EXTRA_TEXT, text)
      ContextCompat.startForegroundService(reactContext, intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      reactContext.stopService(Intent(reactContext, TrackingForegroundService::class.java))
      promise.resolve(true)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }
}
