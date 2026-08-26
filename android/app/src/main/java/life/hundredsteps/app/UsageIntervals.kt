package life.hundredsteps.app

/**
 * Turning raw usage events into foreground intervals.
 *
 * This is deliberately a pure function over a list of plain data classes rather
 * than something that reaches for UsageStatsManager itself. The pairing rules
 * below are the fiddly part of the whole feature — they decide whether a locked
 * phone counts as screen time — and keeping them free of Android types means
 * they run as ordinary JVM unit tests in CI, on a machine with no device and no
 * emulator attached.
 *
 * What comes out is deliberately raw: overlapping intervals are left
 * overlapping, and nothing is clipped to the day. The web layer
 * (`screenTimeUsage.ts`) merges and clips, and is tested there. Doing the
 * arithmetic twice in two languages is how the two halves drift apart.
 */

/** One foreground stretch. Half-open: [start, end). */
data class Interval(val start: Long, val end: Long)

/**
 * The subset of `UsageEvents.Event` this cares about. The integers are the
 * platform's own constants, which are compile-time values and identical across
 * the versions that renamed them (MOVE_TO_FOREGROUND became ACTIVITY_RESUMED
 * without changing its value), so older devices simply never emit the newer
 * ones rather than misreporting.
 */
data class UsageEventRecord(val packageName: String, val eventType: Int, val timeStamp: Long)

object EventTypes {
    const val ACTIVITY_RESUMED = 1 // was MOVE_TO_FOREGROUND
    const val ACTIVITY_PAUSED = 2 // was MOVE_TO_BACKGROUND
    const val SCREEN_NON_INTERACTIVE = 16 // API 28+
    const val KEYGUARD_SHOWN = 17 // API 28+
    const val ACTIVITY_STOPPED = 23 // API 29+
}

/**
 * Pair resume/pause events into intervals.
 *
 * Three rules earn their keep here:
 *
 *  - The screen going dark ends every open session. Without this, opening an
 *    app and pocketing the phone reads as hours of use, because a pause event
 *    is not guaranteed to arrive when the screen locks.
 *  - A session still open at the end of the window is closed at `windowEnd`,
 *    not left out. The app you are looking at right now is usage too.
 *  - A resume with no matching pause and no window end is dropped rather than
 *    guessed at. An invented end is worse than a missing one.
 *
 * @param windowEnd the moment the query covers up to, normally "now".
 */
fun buildIntervals(events: List<UsageEventRecord>, windowEnd: Long): List<Interval> {
    val open = HashMap<String, Long>()
    val intervals = mutableListOf<Interval>()

    fun close(packageName: String, at: Long) {
        val start = open.remove(packageName) ?: return
        if (at > start) intervals.add(Interval(start, at))
    }

    fun closeAll(at: Long) {
        for ((packageName, start) in open) if (at > start) intervals.add(Interval(start, at))
        open.clear()
    }

    for (event in events.sortedBy { it.timeStamp }) {
        when (event.eventType) {
            EventTypes.ACTIVITY_RESUMED ->
                // A second resume without a pause is the same session continuing;
                // keep the earlier start so the stretch is not cut in half.
                open.putIfAbsent(event.packageName, event.timeStamp)

            EventTypes.ACTIVITY_PAUSED, EventTypes.ACTIVITY_STOPPED ->
                close(event.packageName, event.timeStamp)

            EventTypes.SCREEN_NON_INTERACTIVE, EventTypes.KEYGUARD_SHOWN ->
                closeAll(event.timeStamp)
        }
    }

    closeAll(windowEnd)
    return intervals.sortedBy { it.start }
}

/** The shape the web layer parses: a compact JSON array of [start, end] pairs. */
fun intervalsToJson(intervals: List<Interval>): String =
    intervals.joinToString(prefix = "[", postfix = "]", separator = ",") { "[${it.start},${it.end}]" }
