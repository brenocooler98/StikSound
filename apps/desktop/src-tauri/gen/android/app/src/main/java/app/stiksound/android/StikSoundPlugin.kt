package app.stiksound.android

import android.app.Activity
import android.content.ClipData
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@TauriPlugin
class StikSoundPlugin(private val activity: Activity) : Plugin(activity) {

  private data class FileArgs(val file: File, val fileName: String, val mimeType: String)

  private fun readArgs(invoke: Invoke): FileArgs {
    val args = invoke.getArgs()
    val file = File(args.getString("path"))
    val cacheRoot = activity.cacheDir.canonicalPath + File.separator
    require(file.canonicalPath.startsWith(cacheRoot)) { "File is outside the app cache" }
    require(file.isFile) { "File not found" }
    val fileName = args.getString("fileName")
    val mimeType = args.getString("mimeType", "application/octet-stream") ?: "application/octet-stream"
    return FileArgs(file, fileName, mimeType)
  }

  @Command
  fun shareFile(invoke: Invoke) {
    try {
      val args = readArgs(invoke)
      val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", args.file)
      val send = Intent(Intent.ACTION_SEND).apply {
        type = args.mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        clipData = ClipData.newRawUri(args.fileName, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = Intent.createChooser(send, null).apply {
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      activity.startActivity(chooser)
      invoke.resolve(JSObject().put("location", "shared"))
    } catch (e: Exception) {
      invoke.reject(e.message ?: "Share failed", e)
    }
  }

  @Command
  fun saveFile(invoke: Invoke) {
    try {
      val args = readArgs(invoke)
      val (collection, folder) = when {
        args.mimeType.startsWith("video/") ->
          MediaStore.Video.Media.EXTERNAL_CONTENT_URI to "${Environment.DIRECTORY_MOVIES}/StikSound"
        args.mimeType.startsWith("image/") ->
          MediaStore.Images.Media.EXTERNAL_CONTENT_URI to "${Environment.DIRECTORY_PICTURES}/StikSound"
        else ->
          MediaStore.Downloads.EXTERNAL_CONTENT_URI to "${Environment.DIRECTORY_DOWNLOADS}/StikSound"
      }
      val resolver = activity.contentResolver
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, args.fileName)
        put(MediaStore.MediaColumns.MIME_TYPE, args.mimeType)
        put(MediaStore.MediaColumns.RELATIVE_PATH, folder)
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
      val item: Uri = resolver.insert(collection, values) ?: throw IllegalStateException("Could not create file")
      try {
        resolver.openOutputStream(item)?.use { out ->
          args.file.inputStream().use { input -> input.copyTo(out) }
        } ?: throw IllegalStateException("Could not open file")
        resolver.update(item, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
      } catch (e: Exception) {
        resolver.delete(item, null, null)
        throw e
      }
      args.file.delete()
      invoke.resolve(JSObject().put("location", "$folder/${args.fileName}"))
    } catch (e: Exception) {
      invoke.reject(e.message ?: "Save failed", e)
    }
  }
}
