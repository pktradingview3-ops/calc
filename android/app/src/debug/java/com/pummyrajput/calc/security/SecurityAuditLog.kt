package com.pummyrajput.calc.security

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Append-only, on-device audit trail for every security-test action: permission
 * decisions, camera captures, and every upload attempt with its outcome. The log never
 * leaves the device except when the tester explicitly shares it.
 */
class SecurityAuditLog(context: Context) {

    val directory: File = File(context.filesDir, "security-test").apply { mkdirs() }
    val capturesDirectory: File = File(directory, "captures").apply { mkdirs() }
    private val logFile = File(directory, "audit.log")

    @Synchronized
    fun record(action: String, detail: String) {
        val entry = JSONObject()
            .put("time", TIMESTAMP_FORMAT.format(Date()))
            .put("action", action)
            .put("detail", detail)
        logFile.appendText(entry.toString() + "\n")
        trimIfNeeded()
    }

    fun readAll(): List<String> =
        if (logFile.exists()) logFile.readLines().filter { it.isNotBlank() } else emptyList()

    fun readLast(count: Int = 40): List<String> = readAll().takeLast(count)

    @Synchronized
    fun clearAllTestData() {
        capturesDirectory.listFiles()?.forEach { it.delete() }
        logFile.delete()
        record("test-data-cleared", "All captured test photos and the audit log were deleted by the user.")
    }

    private fun trimIfNeeded() {
        if (!logFile.exists() || logFile.length() < MAX_LOG_BYTES) return
        val lines = logFile.readLines()
        logFile.writeText(lines.takeLast(200).joinToString(separator = "\n", postfix = "\n"))
        logFile.appendText(
            JSONObject()
                .put("time", TIMESTAMP_FORMAT.format(Date()))
                .put("action", "audit-log-trimmed")
                .put("detail", "Older entries were rotated to keep the log small.")
                .toString() + "\n"
        )
    }

    companion object {
        private const val MAX_LOG_BYTES = 256 * 1024
        private val TIMESTAMP_FORMAT = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)
    }
}
