import { Capacitor, registerPlugin } from "@capacitor/core";

/** Läuft Schafland als Android-App (APK) statt im Browser? */
export const isNativeApp = Capacitor.isNativePlatform();

/** Tablet-Funktionen aus der APK (android/…/KioskPlugin.java): drucken, anpinnen. */
export const Kiosk = registerPlugin("Kiosk");
