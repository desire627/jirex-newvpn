# JIREX VPN for Android

Open this directory in Android Studio with JDK 17 or later, Gradle 8.14, and Android SDK 36. Run the app on a device with Android 8.0 or later, or build a debug APK with `gradle :app:assembleDebug`.

Pass `-PjirexUrl=https://your-jirex-domain` to configure the service address at build time. Without that property the sign-in dialog asks for an HTTPS base URL. Use a real JIREX deployment with a reachable AmneziaWG node and an active customer account.

Enter the customer's access key, choose a location, and tap the power button. Accept Android's VPN prompt and open a webpage to generate traffic. The home screen shows a recent tunnel handshake, elapsed time, and real byte counters. Payments remain on the JIREX website.

The APK embeds the Apache-2.0 AmneziaWG Android tunnel library distributed by Zane Schepke as `com.zaneschepke:amneziawg-android:2.3.7`. The library supplies the Android VPN service and native tunnel implementation. See its [Maven Central metadata](https://central.sonatype.com/artifact/com.zaneschepke/amneziawg-android/2.3.7) for upstream details.

The app keeps the session and tunnel configuration in process memory. It remembers the registered device ID per account and location, so reconnecting to the same location can reuse that device. Each new location can consume a separate device slot under JIREX's existing limits.
