package com.hikerpro

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * 활동 기록 중에만 켜지는 포그라운드 서비스 (상단 '활동 기록 중' 알림).
 *
 * 위치 자체는 JS 의 react-native-geolocation-service 가 받는다. 이 서비스가 켜져 있는 동안 앱이
 * '포그라운드 위치 사용 중'으로 취급되므로, 화면이 꺼지거나 주머니에 넣어도 Android 가 위치 수신을
 * 줄이지 않는다(서비스가 없으면 백그라운드에서는 한 시간에 몇 번만 위치가 와서 경로가 직선으로 끊김).
 * 사용자가 기록을 종료하면 바로 꺼진다.
 */
class TrackingForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopForegroundCompat()
      stopSelf()
      return START_NOT_STICKY
    }
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "활동 기록 중"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "이동 경로를 기록하고 있습니다."
    val notification = buildNotification(title, text)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      // 위치 권한이 없거나 백그라운드에서 시작이 막힌 경우: 서비스 없이 기록은 계속된다
      stopSelf()
    }
    // 시스템이 앱을 종료했다면 다시 살리지 않는다 (JS 쪽 임시 저장으로 복구)
    return START_NOT_STICKY
  }

  private fun buildNotification(title: String, text: String): Notification {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "활동 기록", NotificationManager.IMPORTANCE_LOW)
      channel.description = "활동 기록 중임을 알려 줍니다."
      channel.setShowBadge(false)
      manager.createNotificationChannel(channel)
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pending = launch?.let {
      PendingIntent.getActivity(
          this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle(title)
        .setContentText(text)
        .setSmallIcon(applicationInfo.icon)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setContentIntent(pending)
        .build()
  }

  @Suppress("DEPRECATION")
  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      stopForeground(true)
    }
  }

  companion object {
    const val CHANNEL_ID = "hikerpro_tracking"
    const val NOTIFICATION_ID = 4107
    const val ACTION_STOP = "com.hikerpro.tracking.STOP"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
  }
}
