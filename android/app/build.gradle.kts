plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "life.hundredsteps.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "life.hundredsteps.app"
        // 26 so adaptive icons are guaranteed and no PNG fallback is needed.
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            // Left unminified for now: this is a debug-signed build people
            // sideload to try, and an unreadable stack trace from a stripped
            // release would cost more than the few hundred kilobytes saved.
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    // The web build is copied in by the `syncWebBuild` task below.
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("webAssets"))

    lint {
        // The build should fail on a real problem, not on a style opinion.
        warningsAsErrors = false
        abortOnError = true
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    // WebViewAssetLoader: serves the bundled build over https:// rather than
    // file://, so localStorage behaves like it does in a browser.
    implementation("androidx.webkit:webkit:1.12.1")

    testImplementation("junit:junit:4.13.2")
}

/**
 * Copy the built web app into the APK.
 *
 * The web build itself is run by CI (or by hand) before assembling, rather than
 * from here: wiring pnpm into the Gradle graph makes the Android build depend
 * on a working Node toolchain for every task, including the unit tests, which
 * do not need it. If the build output is missing, this fails with a sentence
 * saying what to run instead of a stack trace about a missing directory.
 */
val syncWebBuild by tasks.registering(Copy::class) {
    val source = rootProject.layout.projectDirectory.dir("../dist/public")
    doFirst {
        if (!source.asFile.isDirectory) {
            throw GradleException(
                "The web build is missing at ${source.asFile.path}.\n" +
                    "Run `pnpm install && pnpm build` in the repository root first.",
            )
        }
    }
    from(source)
    into(layout.buildDirectory.dir("webAssets/assets"))
}

tasks.named("preBuild") { dependsOn(syncWebBuild) }
