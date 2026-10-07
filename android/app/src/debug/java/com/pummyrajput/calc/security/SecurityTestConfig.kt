package com.pummyrajput.calc.security

import android.content.Context
import android.content.SharedPreferences
import com.pummyrajput.calc.BuildConfig

/**
 * Holds tester-supplied configuration for the consent-based Security Test Mode.
 *
 * Sources, in order of priority:
 *   1. Values the tester typed into the on-screen form (stored locally on the device).
 *   2. Optional debug build-config defaults (gradle property / environment variable).
 * Nothing is ever committed to source control and release builds ship empty strings.
 */
data class SecurityTestConfig(
    val botToken: String,
    val chatId: String,
    val webhookUrl: String,
    val acknowledgementSeen: Boolean
) {
    val telegramConfigured: Boolean
        get() = botToken.isNotBlank() && chatId.isNotBlank()

    val webhookConfigured: Boolean
        get() = webhookUrl.isNotBlank()
}

class SecurityTestConfigStore(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    fun load(): SecurityTestConfig = SecurityTestConfig(
        botToken = prefs.getString(KEY_TOKEN, null) ?: BuildConfig.SECURITY_TEST_BOT_TOKEN,
        chatId = prefs.getString(KEY_CHAT_ID, null) ?: BuildConfig.SECURITY_TEST_CHAT_ID,
        webhookUrl = prefs.getString(KEY_WEBHOOK, null) ?: BuildConfig.SECURITY_TEST_WEBHOOK_URL,
        acknowledgementSeen = prefs.getBoolean(KEY_ACK, false)
    )

    fun save(botToken: String, chatId: String, webhookUrl: String) {
        prefs.edit()
            .putString(KEY_TOKEN, botToken.trim())
            .putString(KEY_CHAT_ID, chatId.trim())
            .putString(KEY_WEBHOOK, webhookUrl.trim())
            .apply()
    }

    fun markAcknowledged() {
        prefs.edit().putBoolean(KEY_ACK, true).apply()
    }

    fun clearCredentials() {
        prefs.edit()
            .remove(KEY_TOKEN)
            .remove(KEY_CHAT_ID)
            .remove(KEY_WEBHOOK)
            .apply()
    }

    companion object {
        private const val FILE_NAME = "security_test_config"
        private const val KEY_TOKEN = "bot_token"
        private const val KEY_CHAT_ID = "chat_id"
        private const val KEY_WEBHOOK = "webhook_url"
        private const val KEY_ACK = "acknowledgement_seen"
    }
}
