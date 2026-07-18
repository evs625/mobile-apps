plugins {
    id("com.android.application")
}

android {
    namespace = "com.evs625.mobileapps.calculator"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.evs625.mobileapps.calculator"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
