// Help answers shown in the ? panel. Plain text; **bold** and line breaks are formatted.

export function playerHelp(E) {
  const scr = E?.fmt === 'scramble';
  const list = [
    { q: 'How do I enter my score?', a: scr
      ? 'Pick the hole with the arrows or the hole numbers. Tap **+** once and it fills in par, then use **+** and **−** to get to the team score.\nScores save the moment you tap. There is no save button.'
      : 'Pick the hole with the arrows or the hole numbers. Tap **+** under your name once and it fills in par, then use **+** and **−** to get to your **gross** score.\nScores save the moment you tap. Your net score and points appear straight away.' },
    { q: 'I entered the wrong score', a: 'Just tap **+** or **−** again, or tap **Clear hole**. You can change any hole until you sign your card.' },
    { q: 'The + and − buttons do nothing', a: 'Scoring is locked. A message tells you why when you tap:\n**Scoring hasn\'t opened yet**: the organiser still has to open scoring for the event.\n**Waiting for approval**: you registered yourself and the organiser still has to approve you.\n**Card signed**: you\'ve signed, so it\'s locked. Ask the organiser to reopen it.' },
    { q: 'What do the dots next to a name mean?', a: 'Each dot is a shot you receive on that hole from your handicap. Your net score already takes them off.' },
  ];
  if (!scr) list.push(
    { q: 'Why do I enter other players\' scores?', a: 'You are the **marker** for the others in your group, like the person keeping your card on a paper scorecard.\nWhen a player\'s own score and the marker\'s score match, the hole shows **✓ Agreed**. If they don\'t match, both phones show it so you can sort it out on the spot.' },
    { q: 'What does a red dot or "Marker has 5" mean?', a: 'The player and the marker entered different scores for that hole. Agree on the right score, then tap **Use 5** (or whichever number is right), or change your own entry.\nThe committee also sees every disagreement and can settle it.' },
    { q: 'How do I sign my card?', a: 'After all 18 holes, with nothing disputed, scroll to **Finish your round** and tap **Sign my card**, then tap again to confirm.\nYour marker then attests it on their phone. That locks the card, just like handing it in.' },
    { q: 'How do I attest someone\'s card?', a: 'When a player in your group has signed, a button **Attest their card** appears at the bottom of your scores. Check their scores first, then tap it twice.' },
  );
  if (E?.pickupOK) list.push({ q: 'I didn\'t finish a hole', a: 'Tap **Picked up** under the score. It counts as 0 points for that hole.' });
  if (E?.tracksDrives) list.push({ q: 'How do I record whose drive we used?', a: `Under the scores, tap the name of the player whose drive the team used. The numbers show each player's drives so far${E.r?.minDrives ? ` against the minimum of ${E.r.minDrives}` : ''}.` });
  list.push(
    { q: 'How does this format work?', a: E ? `${E.describe()}.\n${E.cbText}.` : 'Ask the organiser.' },
    { q: 'Where is the leaderboard?', a: 'Tap **Leaderboard** at the top. It updates live. Tap any name to see that card hole by hole. **Scorecards** shows every card.' },
    { q: 'How do I save this to my home screen?', a: 'Tap **Add to home screen** under your scores and follow the steps for your phone. You get an app icon that opens your own scorecard in one tap, full screen.' },
    { q: 'I closed the page or my phone died', a: 'Open your personal link again. Everything you entered is saved.\nOn another phone, open the same link there. If you\'ve lost the link, ask the organiser to send it again.' },
    { q: 'Can I share my link?', a: 'No. Your link signs whoever opens it in as you, so keep it to yourself. If it was shared by mistake, the organiser can make you a new one and the old one stops working.' },
  );
  return list;
}

export const eventAdminHelp = [
  { q: 'What do I do first?', a: 'Follow the **Get this event ready** checklist at the top. In short:\n**1.** Check the format and rules under Setup.\n**2.** Add players: one by one, or import an Excel or CSV list.\n**3.** Give each four-ball the same group number.\n**4.** Send each player their personal link under Links & QR.\n**5.** On the day, open scoring under Setup.' },
  { q: 'How do I add players?', a: 'Go to **Players**. Add them one at a time with the form, or import a spreadsheet. **Download template** gives you the right columns: Name and Handicap index are needed; Gender, Category, Tee, Group, Pair, Mobile and Email are optional.\nYou can paste rows straight from Excel too. You see a preview before anything is saved.' },
  { q: 'How do players get to their scorecard?', a: 'Every player gets a **personal link**. Open **Links & QR** and either:\n• tap **WhatsApp** or **Email** next to each player,\n• download the **QR sheet**, print it and hand each player their code, or\n• download the links as a CSV for a mail merge.\nPlayers don\'t sign up or use a password. Opening the link takes them straight to their own card.' },
  { q: 'How do groups work?', a: 'Everyone with the same **group number** is one four-ball. Players can enter scores for the others in their group as marker, so scores get checked.\nIn team formats the group is the team. In Betterball, give partners the same **pair** letter (A or B) within the group. Group 0 means "not in a group yet".' },
  { q: 'Players aren\'t on the list', a: 'Under **Setup → Player registration**, turn on self-registration. **Links & QR** then shows a registration QR code. Players who scan it fill in their details and appear under Players for you to approve (or automatically, if you choose).' },
  { q: 'A player lost their link or it was shared', a: 'Go to **Links & QR** and tap **New link** next to that player, then send them the new one. The old link stops working immediately.' },
  { q: 'How do I start and stop scoring?', a: 'The event starts as a private **Draft**: players can open their links but can\'t score. On the day, go to **Setup** and tap **Open scoring (go live)**. The leaderboard becomes public.\nAfterwards, tap **Close scoring and finalise** to lock the results, then **Move to archive**.' },
  { q: 'A player and their marker disagree', a: 'It shows on both phones and under **Committee → Needs attention**. Tap **Use 5** or **Use 6** to set the official score. A committee score overrides both entries.' },
  { q: 'How do I change a score after a card is signed?', a: 'Use **Committee → Set an official score** for any hole. To let the player edit again instead, go to **Players** and tap **Reopen** next to their card.' },
  { q: 'How do I show the leaderboard on the TV?', a: 'Open **Links & QR → Clubhouse TV display** (or the button on the Leaderboard tab) on the TV\'s browser or a laptop connected to it, then click **Full screen**. It updates itself and rotates through divisions and categories.' },
  { q: 'How do I print or share the results?', a: 'On the **Leaderboard** tab: **Download PDF to print**, **Download image** for WhatsApp, or **Copy results** as text. If a division or category filter is selected, the download shows just that.' },
  { q: 'How do I add someone to help me?', a: 'Club admins can invite helpers under **Club → Admins & invites**. Choose **Event admin** for this event only. They get a link, sign in with their email, and can then run the event with you.' },
  { q: 'Can I change the format after scoring starts?', a: 'Yes, under **Setup → Format & rules**. Everything is recalculated from the scores already entered. Team formats need everyone in groups first.' },
];

export const clubAdminHelp = [
  { q: 'What do I set up first?', a: 'Follow the **Set up your club** checklist:\n**1.** Add your course under **Courses**. The Seasons card loads in one tap; check the ratings and slopes.\n**2.** Create an event under **Events**.\n**3.** Invite helpers under **Admins & invites** if you need them.' },
  { q: 'Where do course ratings and slopes come from?', a: 'From the club\'s current scorecard or the handicap system. Every course handicap is worked out from them, so copy them exactly. Edit them any time under **Courses → Edit**.' },
  { q: 'Club admin or event admin?', a: 'An **event admin** runs one event: players, logos, links, scores and results.\nA **club admin** can run every event, add courses, create events and invite people.' },
  { q: 'Where are past events?', a: 'Finished events stay on the **Events** tab until you move them to the archive from the event\'s Setup tab. The **Archive** tab keeps them by year with full results.' },
  { q: 'How do I add the club logo?', a: '**Club details → Upload club logo**. It shows on events that don\'t have their own logo.' },
];

export const spectatorHelp = [
  { q: 'Is this live?', a: 'Yes. Scores appear the moment players enter them. The page catches up by itself if your connection drops.' },
  { q: 'How do I see a player\'s card?', a: 'Tap their row on the leaderboard, or open **Scorecards** at the top.' },
  { q: 'What do "Check" and "Signed" mean?', a: '**Check**: a player and their marker entered different scores on a hole, and it still needs sorting out.\n**Signed**: the card has been signed by the player and attested by the marker.' },
  { q: 'What does "Thru" mean?', a: 'How many holes have been scored so far. **F** means finished.' },
  { q: 'How are ties decided?', a: 'Only once both have finished: best back 9, then the next countback step set for the event, then the lowest handicap. The row says who won the countback.' },
];

export const organiserHelp = [
  { q: 'How does it work?', a: '**1.** Create your club and add the course.\n**2.** Create an event and load the players.\n**3.** Send each player their personal link or QR code.\n**4.** Open scoring on the day. Players score on their phones and the leaderboard and TV update live.\n**5.** Close scoring, print the results and archive the event.' },
  { q: 'I didn\'t get the sign-in email', a: 'Check spam. Sign-in links can only be sent a few times an hour, so wait a few minutes before asking again. Open the link on the same device you asked from.' },
  { q: 'Do players need an account?', a: 'No. Players use the personal link from the organiser. Only organisers sign in.' },
  { q: 'Someone invited me to help', a: 'Open the invite link they sent you and sign in with your email. The event or club then appears on your **My clubs & events** page.' },
];
