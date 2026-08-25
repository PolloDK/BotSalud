package com.botsaludapp

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class HealthConnectSettingsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "HealthConnectSettings"

    @ReactMethod
    fun openPermissions() {
        val intent = Intent("androidx.health.ACTION_MANAGE_HEALTH_PERMISSIONS").apply {
            putExtra("android.intent.extra.PACKAGE_NAME", reactApplicationContext.packageName)
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactApplicationContext.startActivity(intent)
    }
}
