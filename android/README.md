# JIREX VPN for Android

Open this directory in Android Studio with JDK 17 or later, Gradle 8.14, and Android SDK 36. Run the app on a device with Android 8.0 or later, or build a debug APK with `gradle :app:assembleDebug`.

Pass `-PjirexUrl=https://your-jirex-domain` to configure the service address at build time. Without that property the app asks for the HTTPS base URL on first launch. Use a real JIREX deployment with a reachable AmneziaWG node and an active customer account.

The app opens the sign-in page when there is no valid session. Sign in with an access key or use the sign-up link to create an account. Choose a location, tap the power button, and accept Android's VPN prompt. The VPN screen shows the connection status, elapsed time, connected device count, and days remaining before access expires.

Devices, Payments, and Account open the same customer pages inside the app. In Payments you can choose a plan, see the bank transfer details, attach a receipt, and track its review.

The app checks for payment approval when opened and approximately every 15 seconds while visible. When it sees an approved payment for an active account, it registers this phone at the selected location, or at the first available location if none is selected. Tap the power button when you're ready to connect. If the app was closed at approval time, reopening it checks again.

The APK embeds the Apache-2.0 AmneziaWG Android tunnel library distributed by Zane Schepke as `com.zaneschepke:amneziawg-android:2.3.7`. The library supplies the Android VPN service and native tunnel implementation. See its [Maven Central metadata](https://central.sonatype.com/artifact/com.zaneschepke/amneziawg-android/2.3.7) for upstream details.

The app uses Android's WebView cookie store for the shared sign-in session and keeps its own tunnel configuration in memory. It remembers the registered device ID per account and location. Each new location can consume a separate device slot under JIREX's existing limits.
