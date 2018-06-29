app.intent('SIGIR', conv => {
  /*
  This intent is for the SIGIR 2018 event!
  When the user runs this intent they will register as an atendee of SIGIR.
  SIGIR user ratings will be tracked seperately from the GOAT movie lists & user leaderboard.
  */

  conv.user.storage.fallbackCount = 0; // Required for tracking fallback attempts!

  const fallback_messages = [
    "Sorry, what do you want to do next?",
    "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or discover the GOAT movies?",
  ];
  let suggestions;

  const current_time = Date.now();

  let textToSpeech;
  let textToDisplay;

  if (current_time >= 1531033200 && current_time < 1531479600) {
    /*
      The user is using Vote Goat during SIGIR 2018
    */
    if((conv.user.storage).hasOwnProperty('sigir')) {
      /*
        We've already introduced the user to SIGIR
      */
      textToSpeech = `<speak>` +
        `We're proud to demonstrate Vote Goat at SIGIR 2018!` +
        `Enabled SIGIR 2018 mode. Vote during the SIGIR conference to create this year's SIGIR 'GOAT' movies!` +
        `What next?` +
        `</speak>`;

      textToDisplay = `We're proud to demonstrate Vote Goat at SIGIR 2018!` +
                      `SIGIR 2018 mode already enabled. Remember to vote during the conference to decide this year's SIGIR 'GOAT' movies!` +
                      `What next?`;
    } else {
      /*
        First time the user has navigated to this intent
      */
      textToSpeech = `<speak>` +
        `We're proud to demonstrate Vote Goat at SIGIR 2018 between the 8th and 12th of July in Ann Arbor Michigan, U.S.A.` +
        `Your movie ratings during the SIGIR event will contribute towards SIGIR-only 'GOAT' movie lists!` +
        `What next?` +
        `</speak>`;

      textToDisplay = `We're proud to demonstrate Vote Goat at SIGIR 2018 between the 8th and 12th of July in Ann Arbor Michigan, U.S.A.` +
                      `Your movie ratings during the SIGIR event will contribute towards SIGIR-only 'GOAT' movie lists!` +
                      `What next?`;
    }

    suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation', `🎥 SIGIR Movies`, `🐐 GOAT Movies`, '🏆 Show Stats', '📑 Help', `🚪 Quit`];
    conv.user.storage.sigir = 1

  } else if (current_time < 1531033200) {
    /*
      Before the event.
    */
    textToSpeech = `<speak>` +
      `Vote Goat will be demonstrated live at SIGIR 2018, return here between the 8th and 12th of July to be included in SIGIR-only stats tracking!` +
      `What next?` +
      `</speak>`;

    textToDisplay = ``;

    suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`];

  } else if (current_time >= 1531479600) {
    /*
      After the event.
    */
    textToSpeech = `<speak>` +
      `Vote Goat was demonstrated at the SIGIR 2018 conference in Ann Arbor Michigan, U.S.A.` +
      `SIGIR-only stats tracking is now closed! Return during SIGIR 2019 to curate next year's SIGIR "GOAT" movies.` +
      `So, what next?` +
      `</speak>`;

    textToDisplay = ``;

    suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation', `🎥 SIGIR Movies`, '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`];
  }

  store_repeat_response(conv, 'SIGIR', textToSpeech, textToDisplay); // Storing repeat info
  store_fallback_response(conv, fallback_messages, suggestions);

  chatbase_analytics(
    conv,
    `User visited sigir intent`, // input_message
    'sigir', // input_intent
    'win' // win_or_fail
  );

  conv.ask(
    new SimpleResponse({
      speech: textToSpeech,
      text: textToDisplay
    })
  );

  if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
    conv.ask(
      new Suggestions(suggestions)
    );
  }
});
