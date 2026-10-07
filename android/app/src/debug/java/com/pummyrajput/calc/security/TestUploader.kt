package com.pummyrajput.calc.security

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Consent-driven upload helpers for the Security Test Mode. Every call here is the direct
 * result of the tester pressing an on-screen "Send" button; there is no background,
 * scheduled, or silent network activity anywhere in this module.
 */
class TestUploader {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    sealed class UploadResult {
        data class Success(val summary: String) : UploadResult()
        data class Failure(val reason: String) : UploadResult()
    }

    /** POSTs the captured photo to the tester-owned Telegram bot chat. */
    fun sendPhotoToTelegram(photo: File, botToken: String, chatId: String): UploadResult {
        return try {
            val compressed = compress(photo)
            val body = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("chat_id", chatId)
                .addFormDataPart(
                    "photo",
                    photo.nameWithoutExtension + ".jpg",
                    compressed.toRequestBody(JPEG)
                )
                .addFormDataPart("caption", "Calc security camera test ${photo.name}")
                .build()

            val request = Request.Builder()
                .url("https://api.telegram.org/bot$botToken/sendPhoto")
                .post(body)
                .build()

            client.newCall(request).execute().use { response ->
                val bodyText = response.body?.string().orEmpty()
                val ok = response.isSuccessful && JSONObject(bodyText).optBoolean("ok", true)
                if (ok) UploadResult.Success("Telegram accepted ${compressed.size} bytes (HTTP ${response.code}).")
                else UploadResult.Failure("Telegram rejected the upload (HTTP ${response.code}): ${bodyText.take(200)}")
            }
        } catch (error: Exception) {
            UploadResult.Failure("Telegram upload failed: ${error.message ?: error.javaClass.simpleName}")
        }
    }

    /** POSTs the captured photo to an arbitrary tester-owned HTTPS endpoint (e.g. webhook.site). */
    fun sendPhotoToWebhook(photo: File, webhookUrl: String): UploadResult {
        if (!webhookUrl.startsWith("https://")) {
            return UploadResult.Failure("Webhook URL must use https:// — cleartext uploads are disabled.")
        }
        return try {
            val compressed = compress(photo)
            val request = Request.Builder()
                .url(webhookUrl)
                .header("X-Calc-Test", "security-camera-test")
                .header("X-Calc-Test-File", photo.name)
                .post(compressed.toRequestBody(JPEG))
                .build()

            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) UploadResult.Success("Webhook accepted ${compressed.size} bytes (HTTP ${response.code}).")
                else UploadResult.Failure("Webhook rejected the upload (HTTP ${response.code}).")
            }
        } catch (error: Exception) {
            UploadResult.Failure("Webhook upload failed: ${error.message ?: error.javaClass.simpleName}")
        }
    }

    /** Downscales the camera frame to at most 1280px on the long edge (~85% JPEG) so uploads stay small. */
    private fun compress(photo: File): ByteArray {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(photo.absolutePath, bounds)
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_EDGE) sample *= 2

        val decode = BitmapFactory.Options().apply { inSampleSize = sample }
        val decoded = BitmapFactory.decodeFile(photo.absolutePath, decode)
            ?: throw IllegalStateException("Captured photo could not be decoded.")

        val scale = MAX_EDGE.toFloat() / maxOf(decoded.width, decoded.height)
        val bitmap = if (scale < 1f) {
            Bitmap.createScaledBitmap(
                decoded,
                (decoded.width * scale).toInt().coerceAtLeast(1),
                (decoded.height * scale).toInt().coerceAtLeast(1),
                true
            )
        } else decoded

        val output = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, output)
        if (bitmap !== decoded) bitmap.recycle()
        decoded.recycle()
        return output.toByteArray()
    }

    companion object {
        private const val MAX_EDGE = 1280
        private val JPEG = "image/jpeg".toMediaType()
    }
}
