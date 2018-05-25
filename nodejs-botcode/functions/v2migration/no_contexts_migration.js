function handle_no_contexts(app) {
  /*
  Any ghost contexts shall never haunt us again!
  We shall catch cases where the user got to an intent when they shouldn't have.
  Shouldn't be neccessary with correct dialogflow input contexts... :(
  */
  app.data.fallbackCount = 0; // Required for tracking fallback attempts!

  let no_context_card = app.buildRichResponse();

  const textToSpeech = `<speak>` +
    `Sorry, you've taken the wrong turn. <break time="0.5s" /> ` +
    `What would you like to do instead? <break time="0.25s" /> ` +
    `Rank Movies? <break time="0.25s" /> ` +
    `Get a Movie Recommendation? <break time="0.25s" /> ` +
    `View your stats? <break time="0.25s" /> ` +
    `View the Greated movies of all time? <break time="0.25s" /> ` +
    `Or do you need help? <break time="0.25s" /> ` +
    `</speak>`;

  no_context_card.addSimpleResponse({
    speech: textToSpeech,
    displayText: `Sorry, you've taken the wrong turn.! \n\n ` +
                 `What would you like to do instead? \n\n ` +
                 `🗳 Rank Movies? \n\n ` +
                 `🤔 Get a Movie Recommendation? \n\n ` +
                 `🏆 View your stats? \n\n ` +
                 `🐐 View GOAT movies? \n\n ` +
                 `📑 Or do you need help?`
  });

  if (hasScreen === true) {
    no_context_card.addSuggestions(['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`]);
  }

  app.setContext('handle_no_contexts', 1, {
    "placeholder": "placeholder"
  });

  app.ask(no_context_card); // FIRE!
}
