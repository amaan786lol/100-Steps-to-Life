package life.hundredsteps.app

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.webkit.JavascriptInterface

/**
 * The only part of the app that touches the user's usage data.
 *
 * Everything it hands to the web layer is raw and local: a list of [start, end]
 * pairs, the same shape `screenTimeUsage.ts` already parses and tests. It never
 * returns package names, and nothing here writes to disk or to a network. The
 * app has no internet permission at all, so that is enforced by the manifest
 * rather than promised by a comment.
 *
 * Note what is deliberately NOT used: `UsageStats.getTotalTimeInForeground()`.
 * Summing it across packages double-counts, because the same wall-clock minute
 * is charged to two packages during a hand-off, and to both during split
 * screen. Reading events and pairing them is more work and is the only way to
 * get a total that matches the device's own Digital Wellbeing figure.
 */
class ScreenTimeBridge(private val context: Context) {

    /**
     * Whether Usage Access has been granted. This is a special permission: it
     * cannot be requested with the normal runtime prompt, only granted by hand
     * in Settings, so the interface has to check rather than ask.
     */
    @JavascriptInterface
    fun hasPermission(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager? ?: return false
        // unsafeCheckOpNoThrow only exists from API 29; below that the same
        // check is checkOpNoThrow, which was deprecated rather than removed.
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    /** Open the Settings screen where Usage Access is granted. */
    @JavascriptInterface
    fun requestPermission() {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    /**
     * Foreground intervals between two instants, as `[[start,end],...]`.
     *
     * Returns `[]` rather than throwing when permission is missing: the web
     * layer asks [hasPermission] to tell "no access" from "no usage", and an
     * exception across the JavascriptInterface boundary is awkward to handle
     * and easy to mistake for a crash.
     */
    @JavascriptInterface
    fun readUsage(startMillis: Double, endMillis: Double): String {
        // Doubles, not Longs. JavaScript has only doubles, and the WebView
        // bridge's conversion into a Java long has been lossy for values past
        // 32 bits — which every epoch-millisecond timestamp is. A double is
        // exact to 2^53, so the conversion happens here instead.
        if (!startMillis.isFinite() || !endMillis.isFinite()) return "[]"
        val start = startMillis.toLong()
        val end = endMillis.toLong()
        if (!hasPermission()) return "[]"
        if (end <= start) return "[]"

        val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager?
            ?: return "[]"

        return try {
            intervalsToJson(buildIntervals(collect(manager, start, end), end))
        } catch (error: SecurityException) {
            // Access can be revoked between the check above and the query.
            "[]"
        }
    }

    /** Drain the platform's event cursor into plain records. */
    private fun collect(manager: UsageStatsManager, start: Long, end: Long): List<UsageEventRecord> {
        val events = manager.queryEvents(start, end)
        val records = mutableListOf<UsageEventRecord>()
        val event = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            val packageName = event.packageName ?: continue
            records.add(UsageEventRecord(packageName, event.eventType, event.timeStamp))
        }
        return records
    }

    companion object {
        /** The name this is bound to on `window` in the WebView. */
        const val NAME = "HundredStepsScreenTime"
    }
}
