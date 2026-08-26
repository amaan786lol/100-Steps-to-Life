package life.hundredsteps.app

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * These run on the JVM in CI, with no device and no emulator. They cover the
 * pairing rules, which are the part of the screen-time feature most likely to
 * be quietly wrong — a mistake here does not crash, it just reports a number
 * that looks plausible and is not true.
 */
class UsageIntervalsTest {

    private val t0 = 1_760_000_000_000L
    private fun min(n: Long) = n * 60_000L
    private fun at(n: Long) = t0 + min(n)

    private fun resumed(pkg: String, minute: Long) = UsageEventRecord(pkg, EventTypes.ACTIVITY_RESUMED, at(minute))
    private fun paused(pkg: String, minute: Long) = UsageEventRecord(pkg, EventTypes.ACTIVITY_PAUSED, at(minute))

    @Test
    fun `pairs a resume with its pause`() {
        val intervals = buildIntervals(listOf(resumed("chat", 0), paused("chat", 20)), at(60))
        assertEquals(listOf(Interval(at(0), at(20))), intervals)
    }

    @Test
    fun `closes a session still open at the end of the window`() {
        // The app on screen right now is usage too; leaving it out under-reports.
        val intervals = buildIntervals(listOf(resumed("chat", 50)), at(60))
        assertEquals(listOf(Interval(at(50), at(60))), intervals)
    }

    @Test
    fun `a dark screen ends every open session`() {
        // The rule that matters most: an app left open in a pocket is not use.
        // A pause event is not guaranteed when the screen locks.
        val events = listOf(
            resumed("video", 0),
            UsageEventRecord("android", EventTypes.SCREEN_NON_INTERACTIVE, at(10)),
        )
        assertEquals(listOf(Interval(at(0), at(10))), buildIntervals(events, at(600)))
    }

    @Test
    fun `the keyguard ends sessions the same way`() {
        val events = listOf(
            resumed("video", 0),
            UsageEventRecord("android", EventTypes.KEYGUARD_SHOWN, at(5)),
        )
        assertEquals(listOf(Interval(at(0), at(5))), buildIntervals(events, at(600)))
    }

    @Test
    fun `a dark screen closes several apps at once`() {
        val events = listOf(
            resumed("video", 0),
            resumed("chat", 2),
            UsageEventRecord("android", EventTypes.SCREEN_NON_INTERACTIVE, at(10)),
        )
        assertEquals(
            listOf(Interval(at(0), at(10)), Interval(at(2), at(10))),
            buildIntervals(events, at(600)),
        )
    }

    @Test
    fun `a repeated resume continues the session rather than restarting it`() {
        val events = listOf(resumed("chat", 0), resumed("chat", 5), paused("chat", 20))
        assertEquals(listOf(Interval(at(0), at(20))), buildIntervals(events, at(60)))
    }

    @Test
    fun `a pause with no resume is ignored`() {
        assertEquals(emptyList<Interval>(), buildIntervals(listOf(paused("chat", 20)), at(60)))
    }

    @Test
    fun `a zero length session is dropped`() {
        val events = listOf(resumed("chat", 10), paused("chat", 10))
        assertEquals(emptyList<Interval>(), buildIntervals(events, at(60)))
    }

    @Test
    fun `handles events arriving out of order`() {
        val events = listOf(paused("chat", 20), resumed("chat", 0))
        assertEquals(listOf(Interval(at(0), at(20))), buildIntervals(events, at(60)))
    }

    @Test
    fun `keeps overlapping apps overlapping, for the web layer to merge`() {
        // Two packages foreground at once (split screen, or a hand-off). This
        // deliberately does NOT merge: merging happens once, in TypeScript,
        // where it is tested. Doing it in both places is how they drift apart.
        val events = listOf(
            resumed("chat", 0), resumed("video", 10),
            paused("chat", 20), paused("video", 30),
        )
        assertEquals(
            listOf(Interval(at(0), at(20)), Interval(at(10), at(30))),
            buildIntervals(events, at(60)),
        )
    }

    @Test
    fun `ignores event types it does not understand`() {
        val events = listOf(
            UsageEventRecord("chat", 999, at(1)),
            resumed("chat", 5),
            paused("chat", 8),
        )
        assertEquals(listOf(Interval(at(5), at(8))), buildIntervals(events, at(60)))
    }

    @Test
    fun `returns nothing for no events`() {
        assertEquals(emptyList<Interval>(), buildIntervals(emptyList(), at(60)))
    }

    @Test
    fun `serialises to the pair array the web layer parses`() {
        val json = intervalsToJson(listOf(Interval(1000L, 2000L), Interval(3000L, 4500L)))
        assertEquals("[[1000,2000],[3000,4500]]", json)
    }

    @Test
    fun `serialises nothing as an empty array, not as null`() {
        assertEquals("[]", intervalsToJson(emptyList()))
    }
}
