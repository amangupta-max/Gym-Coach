"""
End-to-end test of the 12 MVP acceptance tests, run in real (headless) Chrome
against the production build with its service worker.

Usage (optional, needs Python + Playwright):
    npm run build && npx vite preview --port 4173 &
    pip install playwright && python -m playwright install chromium
    python tests/e2e.py [--chrome /path/to/chrome] [--url http://localhost:4173/]
"""
import argparse
import json
import re
import shutil
import sys
import tempfile
import time

from playwright.sync_api import Page, expect, sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--url", default="http://localhost:4173/")
ap.add_argument("--chrome", default=None)
ap.add_argument("--shots", default=None, help="folder for screenshots")
args = ap.parse_args()
URL = args.url.rstrip("/") + "/"

results: list[tuple[str, bool, str]] = []


def check(name: str, cond: bool, detail: str = ""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)


def shot(page: Page, name: str):
    if args.shots:
        page.screenshot(path=f"{args.shots}/{name}.png", full_page=True)


def launch(p, user_dir):
    kw = dict(
        viewport={"width": 390, "height": 844},
        is_mobile=True,
        has_touch=True,
        accept_downloads=True,
        args=["--no-sandbox"],
    )
    if args.chrome:
        kw["executable_path"] = args.chrome
    ctx = p.chromium.launch_persistent_context(user_dir, **kw)
    return ctx


def attach(page: Page, errors: list):
    page.on("dialog", lambda d: d.accept("DELETE") if d.type == "prompt" else d.accept())
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)


def fill(page: Page, label: str, value: str):
    el = page.get_by_label(label, exact=True)
    el.fill(value)
    el.blur()


def hide_timer(page: Page):
    """The rest dock covers the lower screen; collapse it to the pill like a user would."""
    expect(page.get_by_label("Hide timer")).to_be_visible()
    page.get_by_label("Hide timer").click()
    expect(page.get_by_label("Show timer")).to_be_visible()


def goto_exercise(page: Page, n: int):
    page.get_by_role("button", name=re.compile(rf"^Exercise {n}:")).click()


def remaining_ms(page: Page) -> int:
    return int(page.get_attribute('[data-testid=timer-remaining]', "data-remaining-ms"))


user_dir = tempfile.mkdtemp(prefix="gym-e2e-")
errors: list[str] = []

with sync_playwright() as p:
    ctx = launch(p, user_dir)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    attach(page, errors)
    page.goto(URL)
    expect(page.get_by_role("navigation", name="Main")).to_be_visible()

    # ── TEST 1: open Monday's workout and start it ──
    page.goto(URL + "#/routine/1")
    page.click("[data-testid=start-day]")
    expect(page.get_by_test_id("workout-name")).to_have_text("Push")
    expect(page.get_by_test_id("exercise-name")).to_have_text("Barbell Bench Press")
    workout_url = page.url
    session_id = re.search(r"/workout/([^/?#]+)", workout_url).group(1)
    check("T1 open Monday and start workout", True, session_id)

    # ── TEST 2: switch Barbell Bench Press to Seated Chest Press Machine ──
    page.click("[data-testid=replace-button]")
    page.click("[data-testid=alt-seated-chest-press-machine]")
    expect(page.get_by_test_id("exercise-name")).to_have_text("Seated Chest Press Machine")
    note = page.get_by_test_id("replaced-note").inner_text()
    check("T2 replace with Seated Chest Press Machine", "Barbell Bench Press" in note, note)

    # ── TEST 3: different weights and reps for all sets ──
    for n, (w, r) in enumerate([("30", "12"), ("35", "10"), ("35", "9")], start=1):
        fill(page, f"Set {n} weight", w)
        fill(page, f"Set {n} reps", r)
    time.sleep(0.4)
    vals = [(page.get_by_label(f"Set {n} weight", exact=True).input_value(), page.get_by_label(f"Set {n} reps", exact=True).input_value()) for n in (1, 2, 3)]
    check("T3 enter different weights/reps", vals == [("30", "12"), ("35", "10"), ("35", "9")], str(vals))
    # editing works
    fill(page, "Set 3 reps", "8")
    fill(page, "Set 3 reps", "9")

    # ── TEST 4: completing a set starts the rest timer ──
    page.get_by_label("Complete set 1").click()
    expect(page.get_by_test_id("rest-timer")).to_be_visible()
    rem = remaining_ms(page)
    check("T4 rest timer auto-starts with slot rest (120 s)", 115_000 <= rem <= 120_000, f"{rem} ms")
    # timer controls
    page.get_by_role("button", name="+30s").click()
    time.sleep(0.4)
    r2 = remaining_ms(page)
    page.get_by_role("button", name="Pause").click()
    time.sleep(1.5)
    r3 = remaining_ms(page)
    time.sleep(1.0)
    r4 = remaining_ms(page)
    page.get_by_role("button", name="Resume").click()
    hide_timer(page)
    check("T4b timer +30s / pause holds time", r2 > rem + 25_000 and abs(r3 - r4) < 50, f"after+30={r2} paused={r3}->{r4}")
    page.get_by_label("Complete set 2").click()
    hide_timer(page)
    page.get_by_label("Complete set 3").click()
    hide_timer(page)
    expect(page.locator("[data-testid=set-row-3]")).to_have_attribute("data-status", "completed")
    statuses = [page.get_attribute(f"[data-testid=set-row-{n}]", "data-status") for n in (1, 2, 3)]
    check("T4c each set recorded independently", statuses == ["completed"] * 3, str(statuses))
    # undo then redo
    page.get_by_label("Undo set 3").click()
    expect(page.locator("[data-testid=set-row-3]")).to_have_attribute("data-status", "pending")
    page.get_by_label("Complete set 3").click()
    expect(page.locator("[data-testid=set-row-3]")).to_have_attribute("data-status", "completed")
    hide_timer(page)

    # ── TEST 5: background / kill the page, come back later, timer still accurate ──
    before = remaining_ms(page)
    t_before = time.time()
    page.close()  # like Android freezing/killing the tab
    time.sleep(6)
    page = ctx.new_page()
    attach(page, errors)
    page.goto(workout_url)
    expect(page.get_by_test_id("rest-timer")).to_be_visible()
    after = remaining_ms(page)
    elapsed = (time.time() - t_before) * 1000
    drift = abs((before - after) - elapsed)
    check("T5 timer accurate after page was closed ~6 s", drift < 1500, f"before={before} after={after} elapsed={elapsed:.0f} drift={drift:.0f} ms")

    # ── TEST 6: refresh keeps progress ──
    page.reload()
    expect(page.get_by_test_id("exercise-name")).to_have_text("Seated Chest Press Machine")
    vals = [(page.get_by_label(f"Set {n} weight", exact=True).input_value(), page.get_by_label(f"Set {n} reps", exact=True).input_value()) for n in (1, 2, 3)]
    statuses = [page.get_attribute(f"[data-testid=set-row-{n}]", "data-status") for n in (1, 2, 3)]
    check("T6 refresh preserves sets", vals == [("30", "12"), ("35", "10"), ("35", "9")] and statuses == ["completed"] * 3, f"{vals} {statuses}")

    # do a bit more: exercise 2 one set, skip exercise 3
    hide_timer(page)
    page.get_by_role("button", name="Next", exact=True).click()
    expect(page.get_by_test_id("exercise-name")).to_have_text("Incline Dumbbell Press")
    fill(page, "Set 1 weight", "20")
    fill(page, "Set 1 reps", "10")
    page.get_by_label("Complete set 1").click()
    hide_timer(page)
    page.get_by_role("button", name="Next", exact=True).click()
    expect(page.get_by_test_id("exercise-name")).to_have_text("Machine Shoulder Press")
    page.get_by_role("button", name="Skip exercise").click()
    expect(page.get_by_test_id("exercise-name")).to_have_text("Cable Lateral Raise")
    shot(page, "workout-in-progress")

    # ── TEST 7: close and reopen the browser, unfinished workout is recovered ──
    ctx.close()
    ctx = launch(p, user_dir)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    attach(page, errors)
    page.goto(URL)
    expect(page.get_by_test_id("unfinished-card")).to_be_visible()
    page.get_by_role("button", name="Resume workout").click()
    expect(page.get_by_test_id("exercise-name")).to_have_text("Cable Lateral Raise")
    goto_exercise(page, 1)
    expect(page.get_by_test_id("exercise-name")).to_have_text("Seated Chest Press Machine")
    statuses = [page.get_attribute(f"[data-testid=set-row-{n}]", "data-status") for n in (1, 2, 3)]
    check("T7 browser restart recovers unfinished workout", statuses == ["completed"] * 3, str(statuses))

    # ── TEST 8: complete the workout, it appears in history ──
    page.get_by_role("link", name="Finish").click()
    expect(page.get_by_test_id("summary")).to_be_visible()
    s_sets = page.get_by_test_id("sum-sets").inner_text()
    s_reps = page.get_by_test_id("sum-reps").inner_text()
    s_vol = page.get_by_test_id("sum-volume").inner_text()
    check("T8a summary totals", s_sets == "4" and s_reps == "41" and s_vol.replace(",", "").startswith("1225"), f"sets={s_sets} reps={s_reps} vol={s_vol}")
    shot(page, "summary")
    page.get_by_test_id("save-finish").click()
    page.wait_for_url(re.compile(r"#/history/"))
    page.goto(URL + "#/history")
    items = page.get_by_test_id("history-list").locator("a")
    expect(items).to_have_count(1)
    check("T8 completed workout appears in history", items.count() == 1 and "Push" in items.first.inner_text(), items.first.inner_text())
    page.goto(URL)
    check("T8b no unfinished workout after finishing", page.get_by_test_id("unfinished-card").count() == 0)

    # ── TEST 9: next week's workout shows previous weights ──
    page.goto(URL + "#/routine/1")
    page.click("[data-testid=start-day]")
    expect(page.get_by_test_id("exercise-name")).to_have_text("Barbell Bench Press")
    expect(page.get_by_test_id("previous-performance")).to_contain_text(re.compile("Last time|No previous"))
    prev_bench = page.get_by_test_id("previous-performance").inner_text()
    page.click("[data-testid=replace-button]")
    expect(page.locator("[data-testid=alt-seated-chest-press-machine]")).not_to_contain_text("Checking history")
    alt_text = page.locator("[data-testid=alt-seated-chest-press-machine]").inner_text()
    page.click("[data-testid=alt-seated-chest-press-machine]")
    expect(page.get_by_test_id("exercise-name")).to_have_text("Seated Chest Press Machine")
    expect(page.get_by_test_id("previous-performance")).to_contain_text("Last time")
    expect(page.get_by_test_id("set-row-1")).to_contain_text("Last 30 kg × 12")
    prev_machine = " | ".join(page.get_by_test_id(f"set-row-{n}").inner_text().replace("\n", " ") for n in (1, 2, 3))
    pre = [page.get_by_label(f"Set {n} weight", exact=True).input_value() for n in (1, 2, 3)]
    check(
        "T9 previous machine performance shown + weights pre-filled (not increased)",
        "30 kg × 12" in prev_machine and "35 kg × 10" in prev_machine and "35 kg × 9" in prev_machine and pre == ["30", "35", "35"],
        f"prefill={pre}",
    )
    check("T9b replace sheet shows alternative's last performance", "30 kg × 12" in alt_text, alt_text.replace("\n", " | "))
    goto_exercise(page, 2)
    expect(page.get_by_test_id("exercise-name")).to_have_text("Incline Dumbbell Press")
    expect(page.get_by_test_id("previous-performance")).to_contain_text("Last time")
    expect(page.get_by_test_id("set-row-1")).to_contain_text("Last")
    prev_incline = page.get_by_test_id("set-row-1").inner_text()
    check("T9c other exercises show previous too", "20 kg × 10" in prev_incline, prev_incline.replace("\n", " | "))
    shot(page, "next-week")

    # ── TEST 12: tracked against the actual exercise, not the planned one ──
    page.goto(URL + "#/library/barbell-bench-press")
    page.wait_for_selector("text=Not performed yet")
    bench_record = page.locator("text=Not performed yet").count()
    page.goto(URL + "#/library/seated-chest-press-machine")
    page.get_by_test_id("exercise-record").wait_for()
    machine_record = page.get_by_test_id("exercise-record").inner_text()
    check(
        "T12 substitution tracked under actual exercise",
        "No previous record for Barbell Bench Press" in prev_bench and bench_record == 1 and "35 kg × 10" in machine_record,
        f"bench_prev='{prev_bench[:45]}' machine='{machine_record[:80]}'",
    )
    page.goto(URL + "#/progress")
    prs = page.get_by_test_id("personal-records").inner_text()
    check("T12b PR list has machine, not bench", "Seated Chest Press Machine" in prs and "Barbell Bench Press" not in prs, prs.replace("\n", " | ")[:160])
    shot(page, "progress")

    # Cardio + body weight (data for backup test)
    page.goto(URL + "#/cardio")
    page.get_by_test_id("cardio-status-treadmill-warmup").wait_for()
    st = page.get_by_test_id("cardio-status-treadmill-warmup").inner_text()
    check("Cardio planned NOT auto-completed", st == "Not logged yet", st)
    page.click("[data-testid=cardio-log-treadmill-warmup]")
    page.get_by_label("Distance km").fill("1.05")
    page.click("[data-testid=cardio-save-done]")
    expect(page.get_by_test_id("cardio-status-treadmill-warmup")).to_have_text("Done")
    check("Cardio logged as completed", True)
    page.goto(URL + "#/body")
    page.get_by_label("Body weight value").fill("82.4")
    page.get_by_label("Body weight value").press("Enter")
    expect(page.locator("text=82.4").first).to_be_visible()

    # CSV export
    page.goto(URL + "#/settings")
    with page.expect_download() as dl:
        page.click("[data-testid=export-csv]")
    csv_path = dl.value.path()
    csv = open(csv_path, encoding="utf-8").read().splitlines()
    check("CSV export has one row per set", csv[0].startswith("date,workout") and len(csv) >= 1 + 17, f"{len(csv) - 1} rows; header={csv[0][:40]}")

    # ── TEST 10: export and restore JSON ──
    with page.expect_download() as dl:
        page.click("[data-testid=export-json]")
    backup_path = tempfile.mktemp(suffix=".json")
    dl.value.save_as(backup_path)
    data = json.load(open(backup_path))
    check("T10a JSON backup exported", data["app"] == "gym-companion" and data["counts"]["sessions"] == 2, str(data["counts"]))
    page.get_by_role("button", name="Delete all data").click()  # prompt answered with DELETE
    page.wait_for_timeout(800)
    page.goto(URL + "#/history")
    page.wait_for_selector("text=Saved workouts show up here.")
    wiped = page.locator("text=Saved workouts show up here.").count() == 1
    page.goto(URL + "#/settings")
    page.set_input_files("[data-testid=restore-input]", backup_path)
    expect(page.get_by_test_id("restore-confirm")).to_be_visible()
    page.click("[data-testid=restore-confirm-button]")
    page.wait_for_timeout(1000)
    page.goto(URL + "#/history")
    page.get_by_test_id("history-list").wait_for()
    restored = page.get_by_test_id("history-list").locator("a").count()
    page.goto(URL)
    page.get_by_test_id("unfinished-card").wait_for(timeout=5000)
    unfinished_back = page.get_by_test_id("unfinished-card").count()
    page.goto(URL + "#/cardio")
    expect(page.get_by_test_id("cardio-status-treadmill-warmup")).not_to_have_text("Not logged yet")
    cardio_back = page.get_by_test_id("cardio-status-treadmill-warmup").inner_text()
    check("T10 wipe then restore from JSON", wiped and restored == 1 and unfinished_back == 1 and cardio_back == "Done", f"wiped={wiped} history={restored} unfinished={unfinished_back} cardio={cardio_back}")

    # ── TEST 11: offline ──
    page.goto(URL)
    page.reload()
    page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null", timeout=15000)
    ctx.set_offline(True)
    page.reload()
    expect(page.get_by_role("navigation", name="Main")).to_be_visible()
    page.goto(URL + "#/library")
    page.wait_for_timeout(500)
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_function("[...document.images].every(i => i.complete)", timeout=15000)
    broken = page.evaluate("[...document.images].filter(i => !i.naturalWidth).map(i => i.src)")
    n_imgs = page.evaluate("document.images.length")
    # visit every exercise detail image offline
    ids = page.evaluate("[...document.querySelectorAll('a[href*=\"#/library/\"]')].map(a => a.getAttribute('href').split('/').pop())")
    bad_detail = []
    for ex_id in ids:
        page.goto(URL + f"#/library/{ex_id}")
        img = page.get_by_test_id("exercise-image")
        img.wait_for()
        page.wait_for_function("document.querySelector('[data-testid=exercise-image]').complete")
        if not page.evaluate("document.querySelector('[data-testid=exercise-image]').naturalWidth"):
            bad_detail.append(ex_id)
    page.goto(URL)
    page.get_by_role("button", name="Resume workout").click()
    expect(page.get_by_test_id("exercise-name")).to_be_visible()
    goto_exercise(page, 2)
    expect(page.get_by_test_id("exercise-name")).to_have_text("Incline Dumbbell Press")
    fill(page, "Set 1 reps", "11")
    page.get_by_label("Complete set 1").click()
    expect(page.locator("[data-testid=set-row-1]")).to_have_attribute("data-status", "completed")
    check(
        "T11 offline: app, all images and logging work",
        not broken and not bad_detail and n_imgs >= 49 and len(ids) == 49,
        f"thumbs={n_imgs} broken={len(broken)} details={len(ids)} bad_details={bad_detail}",
    )
    shot(page, "offline-workout")
    ctx.set_offline(False)
    ctx.close()

real_errors = [e for e in errors if "Failed to load resource" not in e and "ERR_INTERNET_DISCONNECTED" not in e]
check("No uncaught JS errors", not real_errors, "; ".join(real_errors[:5]))
shutil.rmtree(user_dir, ignore_errors=True)

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
