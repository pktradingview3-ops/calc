plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/** Reads a tester-supplied secret from gradle properties or the environment (never from source). */
fun testerSecret(name: String): String =
    (project.findProperty(name) as? String) ?: System.getenv(name) ?: ""

/** Escapes a value so it can be embedded into a Kotlin BuildConfig String literal. */
fun String.asBuildConfigString(): String =
    "\"" + replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "com.pummyrajput.calc"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pummyrajput.calc"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            // Optional tester defaults for the consent-based Security Test Mode in debug builds only.
            // Set via android/local.properties / ~/.gradle/gradle.properties or environment variables:
            //   SECURITY_TEST_BOT_TOKEN, SECURITY_TEST_CHAT_ID, SECURITY_TEST_WEBHOOK_URL
            buildConfigField("String", "SECURITY_TEST_BOT_TOKEN", testerSecret("SECURITY_TEST_BOT_TOKEN").asBuildConfigString())
            buildConfigField("String", "SECURITY_TEST_CHAT_ID", testerSecret("SECURITY_TEST_CHAT_ID").asBuildConfigString())
            buildConfigField("String", "SECURITY_TEST_WEBHOOK_URL", testerSecret("SECURITY_TEST_WEBHOOK_URL").asBuildConfigString())
        }
        release {
            // Release builds ship no security-test code (see src/debug vs src/release source sets)
            // and never embed tester credentials.
            buildConfigField("String", "SECURITY_TEST_BOT_TOKEN", "\"\"")
            buildConfigField("String", "SECURITY_TEST_CHAT_ID", "\"\"")
            buildConfigField("String", "SECURITY_TEST_WEBHOOK_URL", "\"\"")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    // Activity/CameraX/OkHttp are debugImplementation on purpose: they exist only in
    // debug builds where the consent-based security test tooling lives (src/debug source set).
    debugImplementation("androidx.activity:activity:1.9.3")
    debugImplementation("androidx.camera:camera-core:1.3.4")
    debugImplementation("androidx.camera:camera-camera2:1.3.4")
    debugImplementation("androidx.camera:camera-lifecycle:1.3.4")
    debugImplementation("androidx.camera:camera-view:1.3.4")
    debugImplementation("androidx.lifecycle:lifecycle-runtime:2.7.0")
    debugImplementation("com.squareup.okhttp3:okhttp:4.12.0")
}
