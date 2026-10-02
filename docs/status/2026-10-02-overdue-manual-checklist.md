2026-10-02 — Overdue-fee block: manual checklist
================================================

Where: web = Chrome at http://localhost:8081 (the Metro server for
~/dev/bama-app). iPhone = the dev build on your phone, served by the same Metro.

Hebrew labels are in brackets, e.g. "Finished my part" [סיימתי את חלקי].

If a step does not look the way it says here, stop, note the step number, and
tell me.

Hard-reload the web tab (Cmd+Shift+R) before you start. A tab that has been
open for a while can be running an older build.

THE THREE OVERDUE PUSH NOTIFICATIONS (current wording, shown with ₪120)
------------------------------------------------------------------------
Copied from functions/src/lifecycle/feeOverdue.ts (NOTICE_TEXT). Hebrew is what
is sent today; the English versions exist in code but the server does not yet
know a user's language.

1) Fee is now due — sent when the 4-day contest window closes

   עמלת התיווך בסך ₪120 לתשלום. יש להסדיר אותה כדי להמשיך לקבל פרויקטים חדשים.

   EN: Your ₪120 brokerage fee is now due. Settle it to keep receiving new projects.

2) One day before the block

   תזכורת: עמלה בסך ₪120 טרם שולמה. מחר לא ניתן יהיה לשלוח הצעות או להתקבל לפרויקטים חדשים עד להסדרתה.

   EN: Reminder: a ₪120 fee is still unpaid. From tomorrow you won't be able to send offers or be hired for new projects until it's settled.

3) The block has started

   עמלה בסך ₪120 באיחור. שליחת הצעות וקבלה לפרויקטים חדשים מושהות עד להסדרתה. הפרויקטים הקיימים שלך ממשיכים כרגיל.

   EN: A ₪120 fee is overdue. Sending offers and being hired for new projects are paused until it's settled. Your current projects continue as normal.


Accounts:
  CLIENT = a client account
  PRO    = a professional account
  ADMIN  = your admin account (role: admin)
Use the Part B test logins for section 4. They are in
~/dev/bama-app/.env.test-logins.local (gitignored, never committed). Sections 1–3 can use any accounts
you normally test with.


SECTION 1 — Switch OFF: the normal flow
---------------------------------------
 1. CLIENT, web: post a new project with two roles, e.g. Editor and Colorist.
    See: it appears in your projects.
 2. PRO, iPhone: open the notice board and tap the project, then "Make Offer"
    [הגש הצעה]. Enter prices for BOTH roles and tap "Submit Offer".
    See: the "Offer a bundle deal?" screen.
 3. PRO, iPhone: enter a bundle price lower than the total and tap
    "Add bundle offer".
    See: the offer is sent with no error, and there is NO "Offers are paused"
    dialog.
 4. CLIENT, web: open the project's offers, tap "Accept" [אישור] on the PRO's
    offer, and confirm.
    See: the hire goes through and a group chat opens.
 5. PRO, iPhone: open the chat, then the project details (tap the chat header).
    On your own row tap "Finished my part" [סיימתי את חלקי], then
    "I have finished my part".
    See: "Your part is marked as finished." Your row shows the fee and
    "You can raise an issue until <date>", 4 days from now.
 6. ADMIN, web: open Operations → "Fees & disputes" [עמלות ובירורים] →
    "Outstanding".
    See: the PRO with the fee amount and that project. It should say "Not
    blocked".
 7. ADMIN, web: on that project row tap "Mark paid" [סמן כשולם] and confirm.
    See: "Recorded: fee paid", and the row leaves the list (or shows ₪0).


SECTION 2 — Disputes
--------------------
You need two engagements that are already completed (repeat steps 1–5 of
section 1 twice). Each dispute must be raised within 4 days of its completion.

 8. PRO, iPhone: open project A → project details → your row → "Report an issue"
    [משהו לא תקין]. Choose "The project did not happen" [הפרויקט לא התקיים],
    then "Send".
    See: "Sent. Our team will look at it…", and your row now says
    "With our team".
 9. PRO, iPhone: open project B → "Report an issue" → choose "The fee amount is
    wrong" [סכום העמלה שגוי], add a note, then "Send".
    See: the same "Sent" message.
10. ADMIN, web: hard reload, then Operations → "Fees & disputes" →
    "Needs review" [ממתין לבדיקה].
    See: both projects, each with a card "Disputed: <pro name>". The reason
    line says "Professional says the job didn't happen" or "Professional
    raised an issue with the fee". The card also shows
    "If resolved as completed: ₪X owed".
    (Known: the header line above each card may be blank. That is fix A from
    the dispute report, not yet done.)
11. ADMIN, web: on project B's card, type a corrected price in
    "Corrected price, ₪ (optional)" (e.g. 500), tap "Resolve: completed"
    [סגירה: הושלם], and confirm.
    See: "Dispute resolved", and the card disappears.
    The new fee is 3% of 500 = ₪15 (never less than ₪6).
12. ADMIN, web: on project A's card tap "Resolve: no fee" [סגירה: ללא עמלה] and
    confirm.
    See: "Dispute resolved", and the card disappears.
13. ADMIN, web: open "Outstanding".
    See: project B shows the new amount (₪15 in the example); project A is not
    listed.
14. PRO, iPhone: open the notice board and tap any open project.
    See: no "slots full" sheet caused by A or B. Both slots were released when
    the disputes were resolved. (If you want the slot numbers, ask me and I'll
    read them from the data.)


SECTION 3 — Sign out / sign in on iPhone
----------------------------------------
15. PRO, iPhone: Settings → sign out, then sign straight back in with the same
    account.
16. PRO, iPhone, within 10 seconds of signing in: open any chat and send one
    message.
    See: it appears once and does not stay greyed/pending.
17. PRO, iPhone, right after that: send a price offer on an open project.
    See: it sends normally and shows up once in your sent offers.
18. CLIENT, web: open that chat and that project's offers.
    See: exactly one copy of the message and one copy of the offer.
    (Why this step exists: the third probe saw a write right after
    sign-out → sign-in hang and then report an error, even though it had
    saved. Note anything that hangs for more than a few seconds.)


SECTION 4 — Blocked pro (Part B accounts; the switch is ON only for this section)
--------------------------------------------------------------------------------
Setup (done by me after you approve Part B):
  - TEST PRO has one completed project with an OVERDUE fee;
  - TEST PRO also has one active, hired job (the "existing job");
  - TEST CLIENT has one open project with a pending offer from TEST PRO.
The logins are in the local file I will name. They are not committed.

19. TEST PRO, web: sign in and open the notice board (dashboard).
    See: a red box at the top, "You have an overdue fee"
    [יש לך עמלה באיחור], with the amount (₪…), "…can't send new offers or
    be hired for new projects…", the settlement line with
    bama.app.hk@gmail.com, and a "Fee terms" link.
20. TEST PRO, web: tap any project, or "Make Offer".
    See: a dialog "Offers are paused" [שליחת הצעות מושהית] that names the
    amount. On web it is the browser's own OK/Cancel box: OK = Fee terms,
    Cancel = close. No offer form opens.
21. TEST PRO, iPhone: the same as step 20.
    See: the same dialog with the buttons "Fee terms" [תנאי העמלה] and "Close"
    [סגירה].
22. TEST CLIENT, web: open your open project's offers and tap "Accept" on TEST
    PRO's pending offer, then confirm.
    See: an error toast, "This professional cannot take on additional projects
    right now". It never says anything about a fee.
23. TEST PRO, iPhone: open the existing job's chat and project details.
    See: it all works as before. You can chat, and the job is still "hired".
    Nothing about it changed.
24. ADMIN, web: Operations → "Fees & disputes" → "Outstanding".
    See: TEST PRO marked "Blocked from new projects". Tap "Mark paid" on the
    overdue project and confirm.
25. TEST PRO, web: reload the dashboard.
    See: the red box is gone. Tap a project → "Make Offer" → submit.
    See: it sends normally.
26. TEST CLIENT, web: accept that new offer.
    See: the hire goes through.


SECTION 5 — Hebrew and English (with the section 4 setup, before step 24)
------------------------------------------------------------------------
27. TEST PRO, iPhone, Hebrew: look at the banner.
    See: the text is right-aligned, the icon is on the right of the title,
    no letters are cut at the top, and the amount shows as ₪ plus the number.
28. TEST PRO, iPhone: switch the app to English and look again.
    See: left-aligned English, with the same parts.
29. TEST PRO, iPhone, in each language: trigger the dialog (step 21).
    See: the title and body are in that language, the amount is correct, and
    the buttons are translated.
30. TEST PRO, web: repeat 27–29 in the browser.
    See: the same, except the dialog buttons are the browser's OK/Cancel.


AFTERWARDS
----------
Tell me "done". I will then:
  - turn the switch OFF;
  - delete the Part B accounts and data with the sweep script;
  - list any real (non-test) fee that got an overdueAt while the switch was ON,
    for your decision;
  - show the proof.
