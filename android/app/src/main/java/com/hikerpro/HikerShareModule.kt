package com.hikerpro

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.text.TextPaint
import android.text.TextUtils
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import java.io.File
import java.io.FileOutputStream

/**
 * HIKERPRO Android 공유 모듈 (ACTION_SEND)
 * - shareText: 텍스트만 공유
 * - shareImage: 이미지 1장(EXTRA_STREAM, content:// URI) + 선택 텍스트(EXTRA_TEXT)
 *
 * file:// URI 는 외부 앱에 노출하지 않는다. 앱 내부 filesDir / cacheDir 아래 파일만
 * FileProvider(authority = "<applicationId>.provider", react-native-blob-util 이 manifest 에 등록)로
 * content:// URI 로 변환해 읽기 권한만 부여한다.
 */
class HikerShareModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "HikerShare"

  private fun providerAuthority(context: Context): String = context.packageName + ".provider"

  private fun startChooser(intent: Intent, chooserTitle: String?) {
    val chooser = Intent.createChooser(intent, chooserTitle ?: "공유하기")
    // 대상 앱까지 content:// 읽기 권한이 전달되도록 chooser 에도 ClipData + grant flag 명시
    if (intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0) {
      if (intent.clipData != null) {
        chooser.clipData = intent.clipData
      }
      chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val activity = reactContext.currentActivity
    if (activity != null) {
      activity.startActivity(chooser)
    } else {
      chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(chooser)
    }
  }

  @ReactMethod
  fun shareText(message: String?, title: String?, promise: Promise) {
    val text = message?.trim().orEmpty()
    if (text.isEmpty()) {
      promise.reject("E_EMPTY", "공유할 내용이 없습니다.")
      return
    }
    try {
      val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
        if (!title.isNullOrBlank()) putExtra(Intent.EXTRA_SUBJECT, title)
      }
      startChooser(intent, title)
      promise.resolve(true)
    } catch (e: ActivityNotFoundException) {
      promise.reject("E_NO_APP", "공유할 수 있는 앱이 없습니다.", e)
    } catch (e: Exception) {
      promise.reject("E_SHARE_FAILED", e.message, e)
    }
  }

  // 앱 내부(filesDir/cacheDir) 파일만 허용해 File 로 변환. 조건 미달이면 null
  private fun resolveAppFile(path: String?): File? {
    val context = reactContext.applicationContext
    val rawPath = path?.trim().orEmpty()
    val filePath: String = when {
      rawPath.startsWith("file://") -> Uri.parse(rawPath).path
      rawPath.startsWith("/") -> rawPath
      else -> null
    } ?: return null
    val file = try { File(filePath).canonicalFile } catch (e: Exception) { return null }
    if (!file.exists() || !file.isFile || file.length() <= 0L) return null
    val roots = listOf(context.filesDir, context.cacheDir).mapNotNull {
      try { it.canonicalPath } catch (e: Exception) { null }
    }
    return if (roots.any { file.path.startsWith(it + File.separator) }) file else null
  }

  /**
   * 지도 snapshot PNG 아래에 활동 요약 카드를 그려 이미지 1장(PNG, cacheDir)으로 합성.
   * 카카오톡처럼 이미지와 글을 함께 받지 않는 앱에서도 요약이 이미지 안에 남도록 하기 위함.
   * rows: [{label, value}] — JS 에서 실제 저장된 값만 전달.
   */
  @ReactMethod
  fun composeActivityCard(
      mapPath: String?,
      title: String?,
      rows: ReadableArray?,
      footer: String?,
      promise: Promise,
  ) {
    val source = resolveAppFile(mapPath)
    if (source == null) {
      promise.reject("E_FILE_NOT_FOUND", "지도 이미지 파일을 찾을 수 없습니다.")
      return
    }
    var map: Bitmap? = null
    var out: Bitmap? = null
    try {
      val mapBmp: Bitmap? = BitmapFactory.decodeFile(source.path)
      map = mapBmp
      if (mapBmp == null) {
        promise.reject("E_COMPOSE", "지도 이미지를 읽지 못했습니다.")
        return
      }

      // 행 데이터 (최대 10행, 길이 제한)
      val items = mutableListOf<Pair<String, String>>()
      if (rows != null) {
        for (i in 0 until minOf(rows.size(), 10)) {
          val row = rows.getMap(i) ?: continue
          val label = (if (row.hasKey("label")) row.getString("label") else null)?.trim().orEmpty().take(20)
          val value = (if (row.hasKey("value")) row.getString("value") else null)?.trim().orEmpty().take(60)
          if (label.isNotEmpty() && value.isNotEmpty()) items.add(label to value)
        }
      }

      val width = mapBmp.width
      val s = width / 1080f
      val pad = 48f * s
      val headerH = 150f * s
      val rowH = 76f * s
      val footerText = footer?.trim().orEmpty().take(60)
      val footerH = if (footerText.isNotEmpty()) 90f * s else 0f
      val bodyH = pad * 0.8f + items.size * rowH + footerH + pad * 0.6f
      val totalH = (headerH + mapBmp.height + bodyH).toInt()

      val outBmp: Bitmap = Bitmap.createBitmap(width, totalH, Bitmap.Config.ARGB_8888)
      out = outBmp
      val canvas = Canvas(outBmp)
      canvas.drawColor(Color.WHITE)

      // 상단 브랜드 바
      val barPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#173D2A") }
      canvas.drawRect(0f, 0f, width.toFloat(), headerH, barPaint)
      val brandPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#B8D7C0")
        textSize = 28f * s
        typeface = Typeface.DEFAULT_BOLD
        letterSpacing = 0.15f
      }
      val titlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = 48f * s
        typeface = Typeface.DEFAULT_BOLD
      }
      canvas.drawText("HIKERPRO", pad, 56f * s, brandPaint)
      val titleText = TextUtils.ellipsize(
          title?.trim().orEmpty().ifEmpty { "HIKERPRO 활동 기록" }.take(40),
          titlePaint, width - pad * 2, TextUtils.TruncateAt.END).toString()
      canvas.drawText(titleText, pad, 118f * s, titlePaint)

      // 지도
      canvas.drawBitmap(mapBmp, 0f, headerH, null)

      // 요약 행
      val labelPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#607D8B")
        textSize = 34f * s
      }
      val valuePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#263238")
        textSize = 40f * s
        typeface = Typeface.DEFAULT_BOLD
      }
      val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#EEF2EE")
        strokeWidth = 2f * s
      }
      val labelW = width * 0.32f
      var y = headerH + mapBmp.height + pad * 0.8f
      for ((index, item) in items.withIndex()) {
        val baseline = y + rowH * 0.64f
        canvas.drawText(item.first, pad, baseline, labelPaint)
        val v = TextUtils.ellipsize(item.second, valuePaint, width - pad * 2 - labelW, TextUtils.TruncateAt.END).toString()
        canvas.drawText(v, pad + labelW, baseline, valuePaint)
        if (index < items.size - 1) {
          canvas.drawLine(pad, y + rowH, width - pad, y + rowH, linePaint)
        }
        y += rowH
      }

      // 하단 문구
      if (footerText.isNotEmpty()) {
        val footerBg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#E8F5E9") }
        val top = y + pad * 0.3f
        canvas.drawRoundRect(RectF(pad, top, width - pad, top + 70f * s), 20f * s, 20f * s, footerBg)
        val footerPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
          color = Color.parseColor("#2E7D32")
          textSize = 30f * s
          typeface = Typeface.DEFAULT_BOLD
        }
        val f = TextUtils.ellipsize(footerText, footerPaint, width - pad * 4, TextUtils.TruncateAt.END).toString()
        canvas.drawText(f, pad * 1.6f, top + 46f * s, footerPaint)
      }

      val target = File(reactContext.applicationContext.cacheDir, "hikerpro_activity_" + System.currentTimeMillis() + ".png")
      FileOutputStream(target).use { stream ->
        if (!outBmp.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
          throw IllegalStateException("PNG compress failed")
        }
      }
      promise.resolve("file://" + target.path)
    } catch (e: OutOfMemoryError) {
      promise.reject("E_COMPOSE", "이미지를 만들 메모리가 부족합니다.")
    } catch (e: Exception) {
      promise.reject("E_COMPOSE", "요약 이미지를 만들지 못했습니다.", e)
    } finally {
      map?.recycle()
      out?.recycle()
    }
  }

  // 이미지와 텍스트를 함께 받지 않는 앱(예: 카카오톡) 대비: 요약 텍스트 클립보드 복사
  @ReactMethod
  fun copyText(text: String?, label: String?, promise: Promise) {
    val value = text?.trim().orEmpty()
    if (value.isEmpty()) {
      promise.reject("E_EMPTY", "복사할 내용이 없습니다.")
      return
    }
    try {
      val clipboard = reactContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText(label ?: "HIKERPRO", value))
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("E_CLIPBOARD", "클립보드에 복사하지 못했습니다.", e)
    }
  }

  @ReactMethod
  fun shareImage(path: String?, message: String?, title: String?, promise: Promise) {
    val context = reactContext.applicationContext

    // 1) 경로 정리 (file:// 또는 절대경로만 허용)
    val rawPath = path?.trim().orEmpty()
    val filePath: String? = when {
      rawPath.startsWith("file://") -> Uri.parse(rawPath).path
      rawPath.startsWith("/") -> rawPath
      else -> null
    }
    if (filePath.isNullOrEmpty()) {
      promise.reject("E_INVALID_PATH", "올바른 파일 경로가 아닙니다.")
      return
    }

    val file: File
    try {
      file = File(filePath).canonicalFile
    } catch (e: Exception) {
      promise.reject("E_INVALID_PATH", "올바른 파일 경로가 아닙니다.", e)
      return
    }

    // 2) 파일 존재 확인
    if (!file.exists() || !file.isFile || file.length() <= 0L) {
      promise.reject("E_FILE_NOT_FOUND", "파일을 찾을 수 없습니다.")
      return
    }

    // 3) 앱 내부 저장소(filesDir/cacheDir) 파일만 공유 허용
    val allowedRoots = listOf(context.filesDir, context.cacheDir).mapNotNull {
      try { it.canonicalPath } catch (e: Exception) { null }
    }
    val inAllowedRoot = allowedRoots.any { root ->
      file.path.startsWith(root + File.separator)
    }
    if (!inAllowedRoot) {
      promise.reject("E_PATH_NOT_ALLOWED", "앱 내부 파일만 공유할 수 있습니다.")
      return
    }

    // 4) FileProvider 확인 후 content:// URI 생성
    val authority = providerAuthority(context)
    if (context.packageManager.resolveContentProvider(authority, 0) == null) {
      promise.reject("E_NO_PROVIDER", "FileProvider($authority)를 찾을 수 없습니다.")
      return
    }
    val contentUri: Uri
    try {
      contentUri = FileProvider.getUriForFile(context, authority, file)
    } catch (e: Exception) {
      promise.reject("E_URI", "공유용 파일 주소를 만들지 못했습니다.", e)
      return
    }

    // 5) MIME type
    val mime = when (file.extension.lowercase()) {
      "jpg", "jpeg" -> "image/jpeg"
      "png" -> "image/png"
      else -> "image/*"
    }

    try {
      val text = message?.trim().orEmpty()
      val intent = Intent(Intent.ACTION_SEND).apply {
        type = mime
        putExtra(Intent.EXTRA_STREAM, contentUri)
        if (text.isNotEmpty()) putExtra(Intent.EXTRA_TEXT, text)
        if (!title.isNullOrBlank()) putExtra(Intent.EXTRA_SUBJECT, title)
        // ClipData 를 직접 지정하면 플랫폼의 EXTRA_STREAM/EXTRA_TEXT → ClipData 자동 변환이 생략되므로
        // 플랫폼과 같은 형태(텍스트 + 같은 content:// URI 한 항목)로 구성해 ClipData 를 읽는 앱에도 텍스트가 가도록 함
        clipData = ClipData(
            ClipDescription(title ?: "HIKERPRO", arrayOf(mime)),
            ClipData.Item(
                if (text.isNotEmpty()) text else null,
                null as String?,
                null as Intent?,
                contentUri,
            ),
        )
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      startChooser(intent, title)
      // 실제 전달한 파일/URI 를 JS 로 돌려줘 snapshot 파일과 동일한지 확인 가능하게 함
      val result = Arguments.createMap().apply {
        putString("filePath", file.path)
        putString("contentUri", contentUri.toString())
        putString("mimeType", mime)
        putBoolean("textAttached", text.isNotEmpty())
      }
      promise.resolve(result)
    } catch (e: ActivityNotFoundException) {
      promise.reject("E_NO_APP", "공유할 수 있는 앱이 없습니다.", e)
    } catch (e: Exception) {
      promise.reject("E_SHARE_FAILED", e.message, e)
    }
  }
}
